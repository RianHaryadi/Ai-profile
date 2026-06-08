from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.qr import qr_service
from app.config import get_settings

router = APIRouter(prefix="/api/qr", tags=["qrcode"])
settings = get_settings()


async def get_qr_colors(user: User) -> tuple[str, str]:
    """Helper to retrieve custom QR Code colors based on subscription tier."""
    fill_color = "#1a1a3e"
    back_color = "white"
    
    tier = (user.subscription_tier or "standard").lower()
    if tier in ["pro", "lifetime"] and user.profile and user.profile.qr_style:
        fill_color = user.profile.qr_style.get("fg_color", "#1a1a3e")
        back_color = user.profile.qr_style.get("bg_color", "white")
        
    return fill_color, back_color


@router.get("/{slug}")
async def get_qr_code(slug: str, format: str = "png", db: AsyncSession = Depends(get_db)):
    """
    Generate QR code for a card landing page.
    Supports PNG and SVG formats.
    """
    # Verify slug exists and load profile
    result = await db.execute(
        select(User).options(selectinload(User.profile)).where(User.slug == slug)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Kartu tidak ditemukan")

    # Build card URL
    card_url = f"{settings.APP_URL}/card/{slug}"
    fill_color, back_color = await get_qr_colors(user)

    if format.lower() == "svg":
        svg_content = qr_service.generate_svg(card_url, fill_color=fill_color, back_color=back_color)
        return Response(
            content=svg_content,
            media_type="image/svg+xml",
            headers={"Content-Disposition": f"inline; filename=qr-{slug}.svg"},
        )
    else:
        png_content = qr_service.generate_png(card_url, fill_color=fill_color, back_color=back_color)
        return Response(
            content=png_content,
            media_type="image/png",
            headers={"Content-Disposition": f"inline; filename=qr-{slug}.png"},
        )


@router.get("/{slug}/download")
async def download_qr_code(slug: str, format: str = "png", db: AsyncSession = Depends(get_db)):
    """
    Download QR code as attachment.
    """
    # Verify slug exists and load profile
    result = await db.execute(
        select(User).options(selectinload(User.profile)).where(User.slug == slug)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Kartu tidak ditemukan")

    card_url = f"{settings.APP_URL}/card/{slug}"
    fill_color, back_color = await get_qr_colors(user)

    if format.lower() == "svg":
        svg_content = qr_service.generate_svg(card_url, fill_color=fill_color, back_color=back_color)
        return Response(
            content=svg_content,
            media_type="image/svg+xml",
            headers={"Content-Disposition": f"attachment; filename=qr-{slug}.svg"},
        )
    else:
        png_content = qr_service.generate_png(card_url, fill_color=fill_color, back_color=back_color)
        return Response(
            content=png_content,
            media_type="image/png",
            headers={"Content-Disposition": f"attachment; filename=qr-{slug}.png"},
        )
