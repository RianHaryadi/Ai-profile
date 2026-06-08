import uuid
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.hash import bcrypt
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.user import User
from app.config import get_settings
from app.services.email import email_service

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


class RequestLinkSchema(BaseModel):
    email: EmailStr
    source: str = "dashboard"


class RequestRefreshSchema(BaseModel):
    uid: str
    source: str = "dashboard"


class TokenResponse(BaseModel):
    user_id: str
    slug: str
    email: str
    subscription_tier: str = "standard"


@router.post("/request-link")
async def request_magic_link(data: RequestLinkSchema, db: AsyncSession = Depends(get_db)):
    """
    Request a magic link to access dashboard or onboarding.
    Sends an email with a tokenized link (valid 48 hours).
    New token invalidates any previous token.
    """
    # Find user by email
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        # Return success even if user doesn't exist (security: don't reveal registered emails)
        return {"message": "Jika email terdaftar, link akses akan dikirim."}

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Subscription tidak aktif. Silakan perpanjang langganan.",
        )

    # Generate new token (invalidates previous)
    raw_token = secrets.token_urlsafe(48)
    hashed_token = bcrypt.hash(raw_token)

    user.access_token = hashed_token
    user.token_expires = datetime.now(timezone.utc) + timedelta(hours=48)
    await db.commit()

    # Build magic link
    redirect_path = "onboarding" if data.source == "onboarding" else "dashboard"
    magic_link = f"{settings.APP_URL}/{redirect_path}?token={raw_token}&uid={user.id}"

    # Send email
    await email_service.send_magic_link(user.email, magic_link)

    return {"message": "Jika email terdaftar, link akses akan dikirim."}


@router.post("/request-refresh")
async def request_refresh_link(data: RequestRefreshSchema, db: AsyncSession = Depends(get_db)):
    """
    Request a magic link using user's UUID.
    Sends an email with a tokenized link (valid 48 hours).
    New token invalidates any previous token.
    """
    try:
        user_uuid = uuid.UUID(data.uid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Subscription tidak aktif. Silakan perpanjang langganan.",
        )

    # Generate new token (invalidates previous)
    raw_token = secrets.token_urlsafe(48)
    hashed_token = bcrypt.hash(raw_token)

    user.access_token = hashed_token
    user.token_expires = datetime.now(timezone.utc) + timedelta(hours=48)
    await db.commit()

    # Build magic link
    redirect_path = "onboarding" if data.source == "onboarding" else "dashboard"
    magic_link = f"{settings.APP_URL}/{redirect_path}?token={raw_token}&uid={user.id}"

    # Send email
    await email_service.send_magic_link(user.email, magic_link)

    return {"message": "Link akses baru telah dikirim ke email terdaftar."}


@router.get("/verify/{token}")
async def verify_token(token: str, uid: str, db: AsyncSession = Depends(get_db)):
    """
    Verify a magic link token.
    Returns user info if valid.
    """
    # Find user
    try:
        user_uuid = uuid.UUID(uid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()

    if not user or not user.access_token:
        raise HTTPException(status_code=401, detail="Token tidak valid")

    # Check token expiry
    if user.token_expires and user.token_expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Token sudah expired. Minta link baru.")

    # Verify hashed token
    if not bcrypt.verify(token, user.access_token):
        raise HTTPException(status_code=401, detail="Token tidak valid")

    return TokenResponse(
        user_id=str(user.id),
        slug=user.slug,
        email=user.email,
        subscription_tier=user.subscription_tier or "standard"
    )


async def get_current_user(token: str, uid: str, db: AsyncSession = Depends(get_db)) -> User:
    """
    Dependency to get current authenticated user from token.
    Used by protected endpoints.
    """
    try:
        user_uuid = uuid.UUID(uid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()

    if not user or not user.access_token:
        raise HTTPException(status_code=401, detail="Akses ditolak")

    if user.token_expires and user.token_expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Token expired")

    if not bcrypt.verify(token, user.access_token):
        raise HTTPException(status_code=401, detail="Token tidak valid")

    return user
