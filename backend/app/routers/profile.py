from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.profile import Profile
from app.routers.auth import get_current_user
from app.services.storage import storage_service

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ProfileResponse(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    links: Optional[dict] = None
    products: Optional[list] = None
    is_active: bool = False
    subscription_tier: str = "standard"
    custom_theme: Optional[dict] = None
    qr_style: Optional[dict] = None

    class Config:
        from_attributes = True


class ProfileUpdateSchema(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    links: Optional[dict] = None
    products: Optional[list] = None
    custom_theme: Optional[dict] = None
    qr_style: Optional[dict] = None


@router.get("/{slug}", response_model=ProfileResponse)
async def get_public_profile(slug: str, db: AsyncSession = Depends(get_db)):
    """
    Get public profile data for a card landing page.
    No authentication required.
    """
    result = await db.execute(
        select(User).where(User.slug == slug)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Kartu tidak ditemukan")

    # Get profile
    result = await db.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()

    if not profile:
        return ProfileResponse(name=slug, is_active=user.is_active)

    # Generate photo URL via proxy endpoint instead of presigned URL
    # This avoids exposing internal MinIO hostnames to the browser
    photo_url = None
    if profile.photo_url:
        photo_url = f"/api/profile/{slug}/photo"

    return ProfileResponse(
        name=profile.name,
        bio=profile.bio,
        photo_url=photo_url,
        links=profile.links,
        products=profile.products,
        is_active=user.is_active,
        subscription_tier=user.subscription_tier or "standard",
        custom_theme=profile.custom_theme,
        qr_style=profile.qr_style,
    )


@router.get("/{slug}/photo")
async def get_profile_photo(slug: str, db: AsyncSession = Depends(get_db)):
    """
    Proxy profile photo from MinIO storage.
    This avoids exposing internal MinIO hostnames (e.g., storage:9000) to the browser.
    """
    from fastapi.responses import Response

    result = await db.execute(
        select(User).where(User.slug == slug)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    result = await db.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()

    if not profile or not profile.photo_url:
        raise HTTPException(status_code=404, detail="Foto tidak ditemukan")

    try:
        data = storage_service.get_file(profile.photo_url)
    except Exception:
        raise HTTPException(status_code=404, detail="Foto tidak bisa dimuat dari storage")

    # Determine content type from file extension
    ext = profile.photo_url.rsplit(".", 1)[-1].lower() if "." in profile.photo_url else "jpg"
    content_type_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    content_type = content_type_map.get(ext, "image/jpeg")

    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.put("/")
async def update_profile(
    data: ProfileUpdateSchema,
    token: str = Query(...),
    uid: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Update user profile. Requires valid magic link token.
    """
    user = await get_current_user(token, uid, db)

    # Get or create profile
    result = await db.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()

    if not profile:
        profile = Profile(user_id=user.id)
        db.add(profile)

    tier = (user.subscription_tier or "standard").lower()

    # Update fields
    if data.name is not None:
        profile.name = data.name
    if data.bio is not None:
        profile.bio = data.bio
        
    if data.links is not None:
        if tier == "standard" and len(data.links) > 3:
            raise HTTPException(
                status_code=400,
                detail="Maksimal 3 link sosial media untuk paket Standard. Silakan tingkatkan paket Anda untuk menikmati tautan tanpa batas."
            )
        profile.links = data.links
        
    if data.products is not None:
        if tier == "standard" and len(data.products) > 3:
            raise HTTPException(
                status_code=400,
                detail="Maksimal 3 produk/jasa untuk paket Standard. Silakan tingkatkan paket Anda untuk menambahkan produk tanpa batas."
            )
        profile.products = data.products

    # Custom theme & QR style only for pro/lifetime
    if data.custom_theme is not None:
        if tier == "standard" and data.custom_theme:
            # Check if dict is not empty
            if any(val for val in data.custom_theme.values() if val):
                raise HTTPException(
                    status_code=400,
                    detail="Kustomisasi tema hanya tersedia untuk pengguna paket Pro."
                )
        profile.custom_theme = data.custom_theme

    if data.qr_style is not None:
        if tier == "standard" and data.qr_style:
            # Check if dict is not empty
            if any(val for val in data.qr_style.values() if val):
                raise HTTPException(
                    status_code=400,
                    detail="Kustomisasi QR Code hanya tersedia untuk pengguna paket Pro."
                )
        profile.qr_style = data.qr_style

    await db.commit()
    return {"message": "Profil berhasil diperbarui"}


@router.post("/photo")
async def upload_photo(
    file: UploadFile = File(...),
    token: str = Query(...),
    uid: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload profile photo to MinIO.
    """
    user = await get_current_user(token, uid, db)

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Format file tidak didukung. Gunakan JPG, PNG, atau WebP.")

    # Read file
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail="Ukuran file maksimal 5MB")

    # Upload to MinIO
    ext = file.filename.split(".")[-1] if file.filename else "jpg"
    file_path = f"users/{user.id}/profile.{ext}"
    storage_service.upload_file(file_path, content, file.content_type)

    # Update profile
    result = await db.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()

    if not profile:
        profile = Profile(user_id=user.id, photo_url=file_path)
        db.add(profile)
    else:
        profile.photo_url = file_path

    await db.commit()
    return {"message": "Foto profil berhasil diupload", "photo_url": file_path}
