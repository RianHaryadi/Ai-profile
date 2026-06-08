import uuid
import re
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Request, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from passlib.hash import bcrypt  # type: ignore
import stripe
import stripe.error

from app.database import async_session
from app.models.user import User
from app.models.profile import Profile
from app.config import get_settings
from app.services.email import email_service
from app.services.qr import qr_service
from app.services.storage import storage_service

router = APIRouter(prefix="/api/webhook", tags=["webhook"])
settings = get_settings()
stripe.api_key = settings.STRIPE_SECRET_KEY


def generate_slug(name: str = "") -> str:
    """
    Generate a unique slug from name.
    Format: {sanitized_name}-{4 random chars}
    Example: budi-a8f3
    """
    # Sanitize name: lowercase, no spaces, no special chars
    if name:
        clean = re.sub(r'[^a-z0-9]', '', name.lower().strip())
        clean = clean[:20]  # Max 20 chars from name
    else:
        clean = "user"

    random_suffix = secrets.token_hex(2)  # 4 hex chars
    return f"{clean}-{random_suffix}"


@router.post("/stripe")
async def stripe_webhook(request: Request):
    """
    Handle Stripe webhook events.
    
    Events handled:
    - checkout.session.completed → Create user, generate QR, send welcome email
    - customer.subscription.deleted → Deactivate user
    - invoice.payment_succeeded → Keep user active
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    async with async_session() as db:
        try:
            if event["type"] == "checkout.session.completed":
                await _handle_checkout_completed(db, event["data"]["object"])

            elif event["type"] == "customer.subscription.deleted":
                await _handle_subscription_deleted(db, event["data"]["object"])

            elif event["type"] == "invoice.payment_succeeded":
                await _handle_payment_succeeded(db, event["data"]["object"])

            else:
                print(f"[Webhook] Unhandled event type: {event['type']}")

        except Exception as e:
            print(f"[Webhook] Error handling {event['type']}: {e}")
            raise HTTPException(status_code=500, detail="Webhook processing failed")

    return {"status": "ok"}


async def _handle_checkout_completed(db, session):
    """
    Handle successful checkout:
    1. Create user with unique slug
    2. Create empty profile
    3. Generate magic link token
    4. Generate QR code
    5. Send welcome email
    """
    email = session.get("customer_email") or session.get("customer_details", {}).get("email", "")
    customer_id = session.get("customer", "")
    subscription_id = session.get("subscription", "")
    customer_name = session.get("customer_details", {}).get("name", "")

    if not email:
        print("[Webhook] No email found in checkout session")
        return

    tier = session.get("metadata", {}).get("tier", "standard")

    # Check if user already exists
    result = await db.execute(select(User).where(User.email == email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        # Reactivate existing user
        existing_user.is_active = True
        existing_user.stripe_id = customer_id
        existing_user.stripe_subscription_id = subscription_id
        existing_user.subscription_tier = tier
        if tier != "lifetime":
            existing_user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        else:
            existing_user.subscription_expires_at = None
        await db.commit()
        print(f"[Webhook] Reactivated user: {email}")
        return

    # Generate unique slug
    slug = generate_slug(customer_name)

    # Ensure slug is unique
    for _ in range(10):
        result = await db.execute(select(User).where(User.slug == slug))
        if not result.scalar_one_or_none():
            break
        slug = generate_slug(customer_name)

    # Generate magic link token
    raw_token = secrets.token_urlsafe(48)
    hashed_token = bcrypt.hash(raw_token)

    # Create user
    user = User(
        id=uuid.uuid4(),
        email=email,
        slug=slug,
        access_token=hashed_token,
        token_expires=datetime.now(timezone.utc) + timedelta(hours=48),
        stripe_id=customer_id,
        stripe_subscription_id=subscription_id,
        is_active=True,
        subscription_tier=tier,
        subscription_expires_at=datetime.now(timezone.utc) + timedelta(days=30) if tier != "lifetime" else None
    )
    db.add(user)

    # Create empty profile
    profile = Profile(
        id=uuid.uuid4(),
        user_id=user.id,
        name=customer_name or None,
    )
    db.add(profile)

    await db.commit()

    # Generate QR code and save to MinIO
    card_url = f"{settings.APP_URL}/card/{slug}"
    qr_png = qr_service.generate_png(card_url)
    qr_path = f"users/{user.id}/qr-code.png"
    storage_service.upload_file(qr_path, qr_png, "image/png")

    # Build onboarding link
    onboarding_link = f"{settings.APP_URL}/onboarding?token={raw_token}&uid={user.id}"

    # Send welcome email
    qr_url = storage_service.get_presigned_url(qr_path)
    await email_service.send_welcome_email(email, slug, qr_url, onboarding_link)

    print(f"[Webhook] Created user: {email} (slug: {slug})")


async def _handle_subscription_deleted(db, subscription):
    """Deactivate user when subscription is cancelled."""
    customer_id = subscription.get("customer", "")

    result = await db.execute(select(User).where(User.stripe_id == customer_id))
    user = result.scalar_one_or_none()

    if user:
        user.is_active = False
        await db.commit()
        print(f"[Webhook] Deactivated user: {user.email}")

        # Send notification email
        await email_service.send_subscription_reminder(user.email, 0)


async def _handle_payment_succeeded(db, invoice):
    """Keep user active on successful payment."""
    customer_id = invoice.get("customer", "")

    result = await db.execute(select(User).where(User.stripe_id == customer_id))
    user = result.scalar_one_or_none()

    if user:
        user.is_active = True
        if user.subscription_tier != "lifetime":
            user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        else:
            user.subscription_expires_at = None
        await db.commit()
        print(f"[Webhook] Payment succeeded for: {user.email}")


# ═══════════════════════════════════════════════════
# Midtrans Webhook Notification
# ═══════════════════════════════════════════════════

def verify_midtrans_signature(
    order_id: str, status_code: str, gross_amount: str, signature_key: str, server_key: str
) -> bool:
    """Verify Midtrans signature key to ensure request authenticity."""
    payload_str = f"{order_id}{status_code}{gross_amount}{server_key}"
    calculated_hash = hashlib.sha512(payload_str.encode("utf-8")).hexdigest()
    return calculated_hash == signature_key


@router.post("/midtrans")
async def midtrans_webhook(request: Request):
    """
    Handle Midtrans payment notifications.
    """
    data = await request.json()
    print(f"[Midtrans Webhook] Received notification: {data}")

    order_id = data.get("order_id")
    status_code = data.get("status_code")
    gross_amount = data.get("gross_amount")
    signature_key = data.get("signature_key")
    transaction_status = data.get("transaction_status")
    fraud_status = data.get("fraud_status")

    if not order_id or not signature_key:
        raise HTTPException(status_code=400, detail="Missing required parameters")

    # Verify signature key
    if not verify_midtrans_signature(
        order_id, status_code, gross_amount, signature_key, settings.MIDTRANS_SERVER_KEY
    ):
        print(f"[Midtrans Webhook] Invalid signature key for order: {order_id}")
        raise HTTPException(status_code=401, detail="Invalid signature key")

    async with async_session() as db:
        # Find user by midtrans_order_id
        result = await db.execute(
            select(User).options(selectinload(User.profile)).where(User.midtrans_order_id == order_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            print(f"[Midtrans Webhook] User not found for order: {order_id}")
            return {"status": "user_not_found"}

        # Define payment success conditions
        is_success = False
        if transaction_status == "settlement":
            is_success = True
        elif transaction_status == "capture":
            if fraud_status == "accept":
                is_success = True

        if is_success:
            # Activate user
            user.is_active = True
            if user.subscription_tier != "lifetime":
                user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
            else:
                user.subscription_expires_at = None
            
            # Use the existing raw token stored in stripe_id, fallback if missing
            raw_token = user.stripe_id
            if not raw_token:
                raw_token = secrets.token_urlsafe(48)
                hashed_token = bcrypt.hash(raw_token)
                user.access_token = hashed_token
                user.token_expires = datetime.now(timezone.utc) + timedelta(hours=48)
                user.stripe_id = raw_token

            await db.commit()

            # Trigger background services (QR Code, welcome email)
            try:
                card_url = f"{settings.APP_URL}/card/{user.slug}"
                qr_png = qr_service.generate_png(card_url)
                qr_path = f"users/{user.id}/qr-code.png"
                storage_service.upload_file(qr_path, qr_png, "image/png")

                # Build onboarding link
                onboarding_link = f"{settings.APP_URL}/onboarding?token={raw_token}&uid={user.id}"

                # Send welcome email
                qr_url = storage_service.get_presigned_url(qr_path)
                await email_service.send_welcome_email(user.email, user.slug, qr_url, onboarding_link)
                print(f"[Midtrans Webhook] Activated user & sent email for: {user.email}")
            except Exception as e:
                print(f"[Midtrans Webhook] Error triggering post-payment services for {user.email}: {e}")

        elif transaction_status in ["deny", "cancel", "expire"]:
            # Deactivate user
            user.is_active = False
            await db.commit()
            print(f"[Midtrans Webhook] Payment failed (status: {transaction_status}) for: {user.email}")

    return {"status": "ok"}
