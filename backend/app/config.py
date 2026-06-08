from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ─── App ────────────────────────────────────────
    DEV_MODE: bool = False
    APP_URL: str = "http://localhost:3001"
    API_URL: str = "http://localhost:8000"
    SECRET_KEY: str = "change-this-to-a-secure-random-key"
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"

    # ─── Database ───────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/aicard"

    # ─── AI / LLM ──────────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str | None = None
    LLM_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 1536

    # ─── MinIO ──────────────────────────────────────
    MINIO_ENDPOINT: str = "storage:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET_NAME: str = "aicard-files"
    MINIO_USE_SSL: bool = False

    # ─── Stripe ─────────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_ID: str = ""

    # ─── Midtrans ───────────────────────────────────
    MIDTRANS_MERCHANT_ID: str = ""
    MIDTRANS_CLIENT_KEY: str = ""
    MIDTRANS_SERVER_KEY: str = ""
    MIDTRANS_IS_PRODUCTION: bool = False

    # ─── Email ──────────────────────────────────────
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@yourdomain.com"

    # ─── RAG Config ─────────────────────────────────
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    TOP_K_RESULTS: int = 5

    class Config:
        env_file = ".env"
        extra = "allow"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
