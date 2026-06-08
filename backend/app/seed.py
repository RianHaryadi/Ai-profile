"""
Auto-seed dummy data for development/testing.
Only runs when DEV_MODE=true and the database has no users.
"""

import uuid
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func
from passlib.hash import bcrypt  # type: ignore

from app.database import async_session
from app.models.user import User
from app.models.profile import Profile
from app.config import get_settings

settings = get_settings()

# ─────────────────────────────────────────────
# Dummy Users Data
# ─────────────────────────────────────────────
DUMMY_USERS = [
    {
        "email": "budi@example.com",
        "name": "Budi Santoso",
        "slug": "budi-a8f3",
        "bio": "Konsultan Digital Marketing dengan pengalaman 10+ tahun membantu brand lokal go digital. Spesialis di Social Media Marketing, SEO, dan Google Ads.",
        "links": {
            "website": "https://budisantoso.com",
            "instagram": "https://instagram.com/budisantoso",
            "linkedin": "https://linkedin.com/in/budisantoso",
            "whatsapp": "https://wa.me/6281234567890",
        },
        "products": [
            {
                "name": "Konsultasi Digital Marketing",
                "description": "Sesi 1-on-1 strategi marketing untuk bisnis Anda. Termasuk audit akun dan roadmap 3 bulan.",
                "price": "Rp 500.000 / sesi",
            },
            {
                "name": "Paket Social Media Management",
                "description": "Kelola Instagram & TikTok bisnis Anda. 30 konten/bulan + analytics report.",
                "price": "Rp 3.500.000 / bulan",
            },
            {
                "name": "Workshop Google Ads",
                "description": "Belajar pasang iklan Google dari nol sampai profit. Cocok untuk UMKM.",
                "price": "Rp 1.200.000",
            },
        ],
    },
    {
        "email": "sari@example.com",
        "name": "Sari Dewi",
        "slug": "saridewi-b2c1",
        "bio": "Desainer grafis & branding specialist. Membantu bisnis tampil profesional lewat visual yang memorable. Portfolio 200+ brand.",
        "links": {
            "website": "https://saridewi.design",
            "instagram": "https://instagram.com/saridewi.design",
            "behance": "https://behance.net/saridewi",
            "whatsapp": "https://wa.me/6289876543210",
        },
        "products": [
            {
                "name": "Desain Logo Premium",
                "description": "Logo unik + brand guideline lengkap. 3x revisi, file AI/PNG/SVG.",
                "price": "Rp 2.500.000",
            },
            {
                "name": "Paket Branding Lengkap",
                "description": "Logo + kartu nama + kop surat + social media kit. Semua kebutuhan visual brand Anda.",
                "price": "Rp 7.500.000",
            },
        ],
    },
    {
        "email": "andi@example.com",
        "name": "Andi Prasetyo",
        "slug": "andi-c9d4",
        "bio": "Full-stack developer & tech consultant. Spesialis web app, mobile app, dan integrasi API. Berpengalaman di startup dan enterprise.",
        "links": {
            "website": "https://andiprasetyo.dev",
            "github": "https://github.com/andiprasetyo",
            "linkedin": "https://linkedin.com/in/andiprasetyo",
            "whatsapp": "https://wa.me/6281122334455",
        },
        "products": [],
    },
]


async def seed_dummy_data():
    """
    Seed dummy data into the database.
    Only runs if DEV_MODE=true and no users exist yet.
    """
    if not settings.DEV_MODE:
        return

    async with async_session() as db:
        # Check if users already exist
        result = await db.execute(select(func.count(User.id)))
        user_count: int = result.scalar() or 0

        if user_count > 0:
            print(f"📦 Database sudah ada {user_count} user, skip seeding.")
            return

        print("🌱 Seeding dummy data...")

        created_users = []

        for data in DUMMY_USERS:
            # Generate magic link token
            raw_token = secrets.token_urlsafe(48)
            hashed_token = bcrypt.hash(raw_token)

            user = User(
                id=uuid.uuid4(),
                email=data["email"],
                slug=data["slug"],
                access_token=hashed_token,
                token_expires=datetime.now(timezone.utc) + timedelta(hours=48),
                stripe_id=f"dev_cus_{secrets.token_hex(8)}",
                stripe_subscription_id=f"dev_sub_{secrets.token_hex(8)}",
                is_active=True,
            )
            db.add(user)

            profile = Profile(
                id=uuid.uuid4(),
                user_id=user.id,
                name=data["name"],
                bio=data["bio"],
                links=data["links"],
                products=data["products"],
            )
            db.add(profile)

            created_users.append({
                "name": data["name"],
                "email": data["email"],
                "slug": data["slug"],
                "token": raw_token,
                "user_id": str(user.id),
            })

        await db.commit()

        # Print summary
        print("=" * 60)
        print("✅ DUMMY DATA BERHASIL DI-SEED!")
        print("=" * 60)
        for u in created_users:
            print(f"\n👤 {u['name']}")
            print(f"   Email : {u['email']}")
            print(f"   Slug  : {u['slug']}")
            print(f"   Card  : {settings.APP_URL}/card/{u['slug']}")
            print(f"   Onboard: {settings.APP_URL}/onboarding?token={u['token']}&uid={u['user_id']}")
            print(f"   Dashboard: {settings.APP_URL}/dashboard?token={u['token']}&uid={u['user_id']}")
        print("=" * 60)
