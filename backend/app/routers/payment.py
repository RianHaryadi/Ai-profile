import uuid
import base64
import secrets
import httpx
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from passlib.hash import bcrypt  # type: ignore
from pydantic import BaseModel, EmailStr

from app.database import get_db, async_session
from app.models.user import User
from app.models.profile import Profile
from app.config import get_settings
from app.routers.webhook import generate_slug

router = APIRouter(prefix="/api/payment", tags=["payment"])
settings = get_settings()


class CreatePaymentRequest(BaseModel):
    email: EmailStr
    name: str
    bio: str
    tier: str = "standard"


@router.post("/create")
async def create_midtrans_transaction(data: CreatePaymentRequest):
    """
    Initiate Midtrans Snap transaction.
    Creates an inactive user in the database (or updates an existing inactive user)
    and returns a Midtrans Snap payment token.
    """
    async with async_session() as db:
        # Find if user already exists
        result = await db.execute(
            select(User).options(selectinload(User.profile)).where(User.email == data.email)
        )
        user = result.scalar_one_or_none()

        if user and user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email ini sudah terdaftar dan berlangganan aktif.",
            )

        order_id = f"order-{uuid.uuid4()}"

        # ─── Call Midtrans Snap API ────────────────────
        # Prepare auth header
        server_key = settings.MIDTRANS_SERVER_KEY
        auth_string = f"{server_key}:"
        auth_bytes = auth_string.encode("utf-8")
        auth_b64 = base64.b64encode(auth_bytes).decode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Basic {auth_b64}"
        }

        tier = data.tier.lower()
        if tier not in ["standard", "pro"]:
            tier = "standard"

        # Pricing based on tier
        gross_amount = 35000 if tier == "standard" else 89000

        payload = {
            "transaction_details": {
                "order_id": order_id,
                "gross_amount": gross_amount
            },
            "customer_details": {
                "email": data.email,
                "first_name": data.name
            },
            "credit_card": {
                "secure": True
            }
        }

        # Select target sandbox or production API URL
        base_url = "https://app.midtrans.com" if settings.MIDTRANS_IS_PRODUCTION else "https://app.sandbox.midtrans.com"
        snap_url = f"{base_url}/snap/v1/transactions"

        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(snap_url, json=payload, headers=headers, timeout=10.0)
                if res.status_code != 201:
                    print(f"[Midtrans Error] Status: {res.status_code}, Body: {res.text}")
                    raise HTTPException(
                        status_code=502,
                        detail="Gagal menghubungi gateway pembayaran Midtrans."
                    )
                snap_data = res.json()
        except httpx.RequestError as exc:
            print(f"[Midtrans Request Exception] {exc}")
            raise HTTPException(
                status_code=502,
                detail="Koneksi ke gateway pembayaran Midtrans terputus."
            )

        snap_token = snap_data.get("token")
        redirect_url = snap_data.get("redirect_url")

        # Generate magic link token for onboarding
        raw_token = secrets.token_urlsafe(48)
        hashed_token = bcrypt.hash(raw_token)

        # ─── Save / Update User in DB ──────────────────
        if user:
            # User exists but is inactive, update the order_id and token
            user.midtrans_order_id = order_id
            user.access_token = hashed_token
            user.token_expires = datetime.now(timezone.utc) + timedelta(hours=48)
            user.stripe_id = raw_token  # Save raw token temporarily
            user.subscription_tier = tier
            if user.profile:
                user.profile.name = data.name
                user.profile.bio = data.bio
            else:
                profile = Profile(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    name=data.name,
                    bio=data.bio
                )
                db.add(profile)
        else:
            # Create a new inactive user
            slug = generate_slug(data.name)
            # Ensure slug uniqueness
            for _ in range(10):
                result = await db.execute(select(User).where(User.slug == slug))
                if not result.scalar_one_or_none():
                    break
                slug = generate_slug(data.name)

            user = User(
                id=uuid.uuid4(),
                email=data.email,
                slug=slug,
                is_active=False,
                midtrans_order_id=order_id,
                access_token=hashed_token,
                token_expires=datetime.now(timezone.utc) + timedelta(hours=48),
                stripe_id=raw_token,  # Save raw token temporarily
                subscription_tier=tier
            )
            db.add(user)

            profile = Profile(
                id=uuid.uuid4(),
                user_id=user.id,
                name=data.name,
                bio=data.bio
            )
            db.add(profile)

        await db.commit()

        return {
            "order_id": order_id,
            "snap_token": snap_token,
            "redirect_url": redirect_url
        }


@router.get("/status")
async def check_payment_status(order_id: str):
    """
    Poll checking if user with order_id is active.
    If not active, fallback checks the status directly from Midtrans API.
    If active, generates a fresh token and returns onboarding link.
    """
    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.midtrans_order_id == order_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaksi tidak ditemukan."
            )

        # If not active, fallback to check Midtrans API directly (helpful for localhost testing)
        if not user.is_active:
            server_key = settings.MIDTRANS_SERVER_KEY
            auth_string = f"{server_key}:"
            auth_bytes = auth_string.encode("utf-8")
            auth_b64 = base64.b64encode(auth_bytes).decode("utf-8")

            headers = {
                "Accept": "application/json",
                "Authorization": f"Basic {auth_b64}"
            }

            base_url = "https://api.midtrans.com" if settings.MIDTRANS_IS_PRODUCTION else "https://api.sandbox.midtrans.com"
            status_url = f"{base_url}/v2/{order_id}/status"

            try:
                async with httpx.AsyncClient() as client:
                    res = await client.get(status_url, headers=headers, timeout=10.0)
                    if res.status_code == 200:
                        midtrans_data = res.json()
                        tx_status = midtrans_data.get("transaction_status")
                        fraud_status = midtrans_data.get("fraud_status")

                        is_success = False
                        if tx_status == "settlement":
                            is_success = True
                        elif tx_status == "capture":
                            if fraud_status == "accept":
                                is_success = True

                        if is_success:
                            # Activate user
                            user.is_active = True
                            if user.subscription_tier != "lifetime":
                                user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
                            else:
                                user.subscription_expires_at = None
                            await db.commit()

                            # Trigger post-payment services
                            try:
                                from app.services.qr import qr_service
                                from app.services.storage import storage_service
                                from app.services.email import email_service

                                raw_token = user.stripe_id or ""
                                card_url = f"{settings.APP_URL}/card/{user.slug}"
                                qr_png = qr_service.generate_png(card_url)
                                qr_path = f"users/{user.id}/qr-code.png"
                                storage_service.upload_file(qr_path, qr_png, "image/png")

                                onboarding_link = f"{settings.APP_URL}/onboarding?token={raw_token}&uid={user.id}"
                                qr_url = storage_service.get_presigned_url(qr_path)
                                await email_service.send_welcome_email(user.email, user.slug, qr_url, onboarding_link)
                                print(f"[Status Polling Fallback] Activated user & sent email for: {user.email}")
                            except Exception as asset_err:
                                print(f"[Status Polling Fallback] Error in asset setup: {asset_err}")
            except Exception as e:
                print(f"[Status Polling Fallback] Failed to check status from Midtrans: {e}")

        # Check again if active (either originally or just activated via API query)
        if user.is_active:
            # Use the existing token stored in stripe_id instead of generating a new one
            raw_token = user.stripe_id or ""
            onboarding_link = f"{settings.APP_URL}/onboarding?token={raw_token}&uid={user.id}"
            return {
                "status": "active",
                "onboarding_link": onboarding_link
            }
        
        return {
            "status": "pending"
        }
