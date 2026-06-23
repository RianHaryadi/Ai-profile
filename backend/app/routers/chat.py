from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.profile import Profile
from app.services.rag import rag_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None


class ChatResponse(BaseModel):
    response: str
    slug: str


@router.post("/{slug}", response_model=ChatResponse)
async def chat_with_card(
    slug: str,
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Public RAG chat endpoint.
    Anyone who scans the QR code can chat with the AI about the card owner.
    
    Flow: query → embed → similarity search (filtered by user_id) → LLM response
    """
    # Find user by slug
    result = await db.execute(select(User).where(User.slug == slug))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Kartu tidak ditemukan")

    # Check if user subscription is active
    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Maaf, kartu bisnis ini sedang tidak aktif.",
        )

    # Get profile name for context
    result = await db.execute(select(Profile).where(Profile.user_id == user.id))
    profile = result.scalar_one_or_none()
    profile_name = profile.name if profile and profile.name else slug

    # Validate message
    if not data.message or len(data.message.strip()) == 0:
        raise HTTPException(status_code=400, detail="Pesan tidak boleh kosong")

    if len(data.message) > 1000:
        raise HTTPException(status_code=400, detail="Pesan terlalu panjang (maks 1000 karakter)")

    # RAG pipeline: similarity search → LLM response
    try:
        response = await rag_service.chat(
            db=db,
            query=data.message.strip(),
            user_id=str(user.id),
            profile_name=profile_name,
            profile=profile,
            history=data.history or [],
        )
    except Exception as e:
        print(f"[Chat] Error for slug={slug}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Maaf, terjadi kesalahan saat memproses pertanyaan. Silakan coba lagi.",
        )

    return ChatResponse(response=response, slug=slug)


@router.get("/{slug}/preset-questions")
async def get_preset_questions(slug: str, db: AsyncSession = Depends(get_db)):
    """
    Get preset questions for a card's chatbot.
    These are shown as clickable buttons on the landing page.
    """
    result = await db.execute(select(User).where(User.slug == slug))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Kartu tidak ditemukan")

    # Get profile for context
    result = await db.execute(select(Profile).where(Profile.user_id == user.id))
    profile = result.scalar_one_or_none()
    name = profile.name if profile and profile.name else "pemilik kartu"

    # Default preset questions
    presets = [
        f"Apa produk/layanan yang ditawarkan {name}?",
        f"Bagaimana cara menghubungi {name}?",
        f"Ceritakan tentang pengalaman dan keahlian {name}",
        f"Bagaimana cara order/bekerja sama?",
        f"Apa keunggulan {name}?",
    ]

    return {"questions": presets, "name": name}
