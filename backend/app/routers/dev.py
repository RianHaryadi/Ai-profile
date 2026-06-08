"""
Development & Admin endpoints for testing without payment integration.
These endpoints are ONLY available when DEV_MODE=true in .env.
"""

import uuid
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from passlib.hash import bcrypt  # type: ignore
from pydantic import BaseModel, EmailStr

from app.database import async_session
from app.models.user import User
from app.models.profile import Profile
from app.config import get_settings

router = APIRouter(prefix="/api/dev", tags=["dev — admin & testing"])
settings = get_settings()


def _check_dev_mode():
    """Guard: only allow in DEV_MODE."""
    if not getattr(settings, "DEV_MODE", False):
        raise HTTPException(
            status_code=403,
            detail="Endpoint ini hanya tersedia di mode development (DEV_MODE=true)",
        )


def verify_admin(x_admin_token: Optional[str] = Header(None)):
    """Guard: verify X-Admin-Token header."""
    _check_dev_mode()
    if not x_admin_token or x_admin_token != settings.SECRET_KEY:
        raise HTTPException(
            status_code=401,
            detail="Akses ditolak: Token admin tidak valid",
        )
    return x_admin_token


class AdminLoginRequest(BaseModel):
    username: str
    password: str


# ═══════════════════════════════════════════════════
# Schemas
# ═══════════════════════════════════════════════════

class ProductSchema(BaseModel):
    name: str = ""
    description: str = ""
    price: str = ""


class ProfileUpdateAdmin(BaseModel):
    """Admin can update any field of a user's profile and user status."""
    name: Optional[str] = None
    bio: Optional[str] = None
    links: Optional[dict] = None
    products: Optional[List[ProductSchema]] = None
    subscription_tier: Optional[str] = None


class SeedUserRequest(BaseModel):
    """Request body for creating a dummy user."""
    email: EmailStr
    name: str = "Test User"
    bio: Optional[str] = "Ini adalah akun dummy untuk testing."
    links: Optional[dict] = None
    products: Optional[list] = None


class SeedUserResponse(BaseModel):
    """Response with all info needed to test the app."""
    message: str
    user_id: str
    email: str
    slug: str
    raw_token: str
    onboarding_link: str
    dashboard_link: str
    card_link: str


class UserProfileResponse(BaseModel):
    """User + profile combined response for admin."""
    id: str
    email: str
    slug: str
    is_active: bool
    created_at: Optional[str] = None
    card_link: str
    profile: Optional[dict] = None


def generate_slug(name: str = "") -> str:
    """Generate a unique slug from name."""
    if name:
        clean = re.sub(r'[^a-z0-9]', '', name.lower().strip())
        clean = clean[:20]
    else:
        clean = "user"
    random_suffix = secrets.token_hex(2)
    return f"{clean}-{random_suffix}"


# ═══════════════════════════════════════════════════
# Admin Endpoints
# ═══════════════════════════════════════════════════

@router.post("/login")
async def admin_login(data: AdminLoginRequest):
    """
    🔑 Authenticate admin credentials and return settings.SECRET_KEY as token.
    """
    _check_dev_mode()
    if data.username != settings.ADMIN_USERNAME or data.password != settings.ADMIN_PASSWORD:
        raise HTTPException(
            status_code=401,
            detail="Username atau password salah",
        )
    return {"token": settings.SECRET_KEY}


@router.get("/users")
async def list_all_users(admin_token: str = Depends(verify_admin)):
    """
    📋 List all users with their profile data.
    Returns users + their profile info for the admin table.
    """
    _check_dev_mode()

    async with async_session() as db:
        result = await db.execute(
            select(User).options(selectinload(User.profile)).order_by(User.created_at.desc())
        )
        users = result.scalars().all()

        return {
            "total": len(users),
            "users": [
                {
                    "id": str(u.id),
                    "email": u.email,
                    "slug": u.slug,
                    "is_active": u.is_active,
                    "subscription_tier": u.subscription_tier or "standard",
                    "subscription_expires_at": str(u.subscription_expires_at) if u.subscription_expires_at else None,
                    "created_at": str(u.created_at) if u.created_at else None,
                    "card_link": f"{settings.APP_URL}/card/{u.slug}",
                    "profile": {
                        "name": u.profile.name if u.profile else None,
                        "bio": u.profile.bio if u.profile else None,
                        "photo_url": f"/api/profile/{u.slug}/photo" if (u.profile and u.profile.photo_url) else None,
                        "links": u.profile.links if u.profile else {},
                        "products": u.profile.products if u.profile else [],
                    } if u.profile else None,
                }
                for u in users
            ],
        }


@router.get("/users/{user_id}")
async def get_user_detail(user_id: str, admin_token: str = Depends(verify_admin)):
    """
    👤 Get detailed user + profile info for admin editing.
    """
    _check_dev_mode()

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    async with async_session() as db:
        result = await db.execute(
            select(User).options(selectinload(User.profile)).where(User.id == user_uuid)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="User tidak ditemukan")

        return {
            "id": str(user.id),
            "email": user.email,
            "slug": user.slug,
            "is_active": user.is_active,
            "subscription_tier": user.subscription_tier or "standard",
            "subscription_expires_at": str(user.subscription_expires_at) if user.subscription_expires_at else None,
            "created_at": str(user.created_at) if user.created_at else None,
            "card_link": f"{settings.APP_URL}/card/{user.slug}",
            "profile": {
                "name": user.profile.name if user.profile else None,
                "bio": user.profile.bio if user.profile else None,
                "photo_url": f"/api/profile/{user.slug}/photo" if (user.profile and user.profile.photo_url) else None,
                "links": user.profile.links if user.profile else {},
                "products": user.profile.products if user.profile else [],
            },
        }


@router.put("/users/{user_id}/profile")
async def update_user_profile_admin(user_id: str, data: ProfileUpdateAdmin, admin_token: str = Depends(verify_admin)):
    """
    ✏️ Admin update — edit any user's profile without magic link token.
    """
    _check_dev_mode()

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    async with async_session() as db:
        result = await db.execute(
            select(User).options(selectinload(User.profile)).where(User.id == user_uuid)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="User tidak ditemukan")

        # Update user fields
        if data.subscription_tier is not None:
            tier_val = data.subscription_tier.lower()
            if tier_val in ["standard", "pro", "lifetime"]:
                user.subscription_tier = tier_val
                if tier_val == "lifetime":
                    user.subscription_expires_at = None
                else:
                    user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)

        # Get or create profile
        profile = user.profile
        if not profile:
            profile = Profile(id=uuid.uuid4(), user_id=user.id)
            db.add(profile)

        # Update fields
        if data.name is not None:
            profile.name = data.name
        if data.bio is not None:
            profile.bio = data.bio
        if data.links is not None:
            profile.links = data.links
        if data.products is not None:
            profile.products = [p.model_dump() for p in data.products]

        await db.commit()

        return {"message": "✅ Profil berhasil diperbarui"}


@router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: str, admin_token: str = Depends(verify_admin)):
    """
    🔄 Toggle user active/inactive status.
    """
    _check_dev_mode()

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="User tidak ditemukan")

        user.is_active = not user.is_active
        await db.commit()

        status = "aktif" if user.is_active else "nonaktif"
        return {
            "message": f"User {user.email} sekarang {status}",
            "is_active": user.is_active,
        }


# ═══════════════════════════════════════════════════
# Seed & Delete
# ═══════════════════════════════════════════════════

@router.post("/seed", response_model=SeedUserResponse)
async def seed_dummy_user(data: SeedUserRequest, admin_token: str = Depends(verify_admin)):
    """
    🧪 DEV ONLY — Create a dummy user without Stripe payment.
    """
    _check_dev_mode()

    async with async_session() as db:
        # Check if user already exists
        result = await db.execute(select(User).where(User.email == data.email))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            # Reactivate and regenerate token
            raw_token = secrets.token_urlsafe(48)
            hashed_token = bcrypt.hash(raw_token)

            existing_user.is_active = True
            existing_user.access_token = hashed_token
            existing_user.token_expires = datetime.now(timezone.utc) + timedelta(hours=48)
            await db.commit()

            return SeedUserResponse(
                message=f"✅ User sudah ada, token di-refresh! (slug: {existing_user.slug})",
                user_id=str(existing_user.id),
                email=existing_user.email,
                slug=existing_user.slug,
                raw_token=raw_token,
                onboarding_link=f"{settings.APP_URL}/onboarding?token={raw_token}&uid={existing_user.id}",
                dashboard_link=f"{settings.APP_URL}/dashboard?token={raw_token}&uid={existing_user.id}",
                card_link=f"{settings.APP_URL}/card/{existing_user.slug}",
            )

        # Generate unique slug
        slug = generate_slug(data.name)
        for _ in range(10):
            result = await db.execute(select(User).where(User.slug == slug))
            if not result.scalar_one_or_none():
                break
            slug = generate_slug(data.name)

        # Generate magic link token
        raw_token = secrets.token_urlsafe(48)
        hashed_token = bcrypt.hash(raw_token)

        # Create user
        user = User(
            id=uuid.uuid4(),
            email=data.email,
            slug=slug,
            access_token=hashed_token,
            token_expires=datetime.now(timezone.utc) + timedelta(hours=48),
            stripe_id=f"dev_cus_{secrets.token_hex(8)}",
            stripe_subscription_id=f"dev_sub_{secrets.token_hex(8)}",
            is_active=True,
        )
        db.add(user)

        # Create profile with provided data
        profile = Profile(
            id=uuid.uuid4(),
            user_id=user.id,
            name=data.name,
            bio=data.bio,
            links=data.links or {},
            products=data.products or [],
        )
        db.add(profile)

        await db.commit()

        return SeedUserResponse(
            message=f"🎉 Dummy user berhasil dibuat! (slug: {slug})",
            user_id=str(user.id),
            email=data.email,
            slug=slug,
            raw_token=raw_token,
            onboarding_link=f"{settings.APP_URL}/onboarding?token={raw_token}&uid={user.id}",
            dashboard_link=f"{settings.APP_URL}/dashboard?token={raw_token}&uid={user.id}",
            card_link=f"{settings.APP_URL}/card/{slug}",
        )


@router.post("/users/{user_id}/login-link")
async def generate_user_login_link(user_id: str, admin_token: str = Depends(verify_admin)):
    """
    🔑 Generate a new login magic link for a user.
    """
    _check_dev_mode()

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="User tidak ditemukan")

        # Generate new magic link token
        raw_token = secrets.token_urlsafe(48)
        hashed_token = bcrypt.hash(raw_token)

        user.access_token = hashed_token
        user.token_expires = datetime.now(timezone.utc) + timedelta(hours=48)
        await db.commit()

        return {
            "dashboard_link": f"{settings.APP_URL}/dashboard?token={raw_token}&uid={user.id}"
        }


@router.delete("/users/{user_id}")
async def delete_dev_user(user_id: str, admin_token: str = Depends(verify_admin)):
    """
    🗑️ DEV ONLY — Delete a test user and all associated data.
    """
    _check_dev_mode()

    async with async_session() as db:
        try:
            user_uuid = uuid.UUID(user_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid user ID")

        result = await db.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="User tidak ditemukan")

        await db.delete(user)
        await db.commit()

        return {"message": f"🗑️ User {user.email} berhasil dihapus"}
