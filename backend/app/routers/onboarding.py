from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
import uuid
from openai import OpenAI

from app.database import get_db
from app.models.user import User
from app.models.profile import Profile
from app.routers.auth import get_current_user
from app.config import get_settings

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])
settings = get_settings()
openai_client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
    base_url=settings.OPENAI_BASE_URL,
)


class OnboardingChatRequest(BaseModel):
    message: str
    conversation_history: Optional[list] = []


class OnboardingChatResponse(BaseModel):
    response: str
    extracted_data: Optional[dict] = None
    is_complete: bool = False


ONBOARDING_SYSTEM_PROMPT = """Kamu adalah asisten AI yang membantu pelanggan setup kartu bisnis AI mereka.

TUGASMU:
1. Tanyakan data berikut secara natural dan conversational (SATU atau DUA pertanyaan per pesan):
   - Nama lengkap
   - Bio singkat (siapa mereka, bidang apa)
   - Produk/layanan yang ditawarkan (bisa lebih dari satu)
   - Harga (opsional)
   - Cara menghubungi / order
   - Link sosial media / website

2. ATURAN:
   - Gunakan Bahasa Indonesia yang ramah dan casual
   - Jangan tanya semua sekaligus, tanya bertahap
   - Berikan pujian/komentar positif atas jawaban mereka
   - Jika pelanggan sudah memberikan cukup info, katakan bahwa setup sudah selesai
   - Pada akhir percakapan, berikan rangkuman data yang dikumpulkan

3. FORMAT JAWABAN:
   - Jika kamu sudah mengekstrak data baru dari jawaban user, tambahkan tag di akhir pesan:
     [DATA_EXTRACTED]
     nama: ...
     bio: ...
     produk: ...
     links: ...
     [/DATA_EXTRACTED]
   
   - Jika semua data penting sudah terkumpul, tambahkan tag:
     [ONBOARDING_COMPLETE]

MULAI dengan sapaan hangat dan tanya nama serta bidang mereka."""


@router.post("/chat", response_model=OnboardingChatResponse)
async def onboarding_chat(
    data: OnboardingChatRequest,
    token: str = Query(...),
    uid: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Conversational onboarding endpoint.
    AI asks questions to collect user's business data naturally.
    Extracted data is auto-saved to profile.
    """
    user = await get_current_user(token, uid, db)

    # Build conversation messages
    messages = [{"role": "system", "content": ONBOARDING_SYSTEM_PROMPT}]

    # Add conversation history
    for msg in (data.conversation_history or []):
        messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
        })

    # Add current message
    messages.append({"role": "user", "content": data.message})

    # Get AI response
    try:
        response = openai_client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=messages,
            max_tokens=800,
            temperature=0.7,
        )
        ai_response = response.choices[0].message.content or ""
    except Exception as e:
        print(f"[Onboarding] LLM error: {e}")
        raise HTTPException(status_code=500, detail="Gagal memproses percakapan")

    # Parse extracted data
    extracted_data = None
    is_complete = False

    if "[DATA_EXTRACTED]" in ai_response:
        extracted_data = _parse_extracted_data(ai_response)
        if extracted_data:
            await _update_profile(db, user.id, extracted_data)

    if "[ONBOARDING_COMPLETE]" in ai_response:
        is_complete = True

    # Clean response (remove tags)
    clean_response = ai_response
    if "[DATA_EXTRACTED]" in clean_response:
        clean_response = clean_response[:clean_response.index("[DATA_EXTRACTED]")].strip()
    if "[ONBOARDING_COMPLETE]" in clean_response:
        clean_response = clean_response.replace("[ONBOARDING_COMPLETE]", "").strip()

    return OnboardingChatResponse(
        response=clean_response,
        extracted_data=extracted_data,
        is_complete=is_complete,
    )


def _parse_extracted_data(text: str) -> Optional[dict]:
    """Parse extracted data from AI response tags."""
    try:
        start = text.index("[DATA_EXTRACTED]") + len("[DATA_EXTRACTED]")
        end = text.index("[/DATA_EXTRACTED]")
        data_text = text[start:end].strip()

        data = {}
        for line in data_text.split("\n"):
            if ":" in line:
                key, value = line.split(":", 1)
                key = key.strip().lower()
                value = value.strip()
                if value and value != "...":
                    data[key] = value

        return data if data else None
    except (ValueError, IndexError):
        return None


async def _update_profile(db: AsyncSession, user_id: uuid.UUID, data: dict):
    """Auto-update profile with extracted onboarding data."""
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()

    if not profile:
        profile = Profile(user_id=user_id)
        db.add(profile)

    if "nama" in data:
        profile.name = data["nama"]
    if "bio" in data:
        profile.bio = data["bio"]
    if "produk" in data or "layanan" in data:
        products = data.get("produk", data.get("layanan", ""))
        if isinstance(products, str):
            products = [p.strip() for p in products.split(",")]
        profile.products = products
    if "links" in data or "website" in data or "instagram" in data:
        links = profile.links or {}
        for key in ["website", "instagram", "linkedin", "whatsapp", "tiktok", "twitter"]:
            if key in data:
                links[key] = data[key]
        if "links" in data:
            links["other"] = data["links"]
        profile.links = links

    await db.commit()


@router.get("/start")
async def start_onboarding(
    token: str = Query(...),
    uid: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Start onboarding — get initial AI greeting.
    """
    user = await get_current_user(token, uid, db)

    try:
        response = openai_client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": ONBOARDING_SYSTEM_PROMPT},
                {"role": "user", "content": "Halo, saya mau setup kartu bisnis AI saya."},
            ],
            max_tokens=300,
            temperature=0.7,
        )
        greeting = response.choices[0].message.content or ""
    except Exception as e:
        greeting = (
            "Halo! 👋 Selamat datang! Saya akan bantu kamu setup kartu bisnis AI.\n\n"
            "Boleh ceritakan dulu, nama kamu siapa dan bergerak di bidang apa?"
        )

    # Clean tags if any
    if "[DATA_EXTRACTED]" in greeting:
        greeting = greeting[:greeting.index("[DATA_EXTRACTED]")].strip()

    return {"greeting": greeting}
