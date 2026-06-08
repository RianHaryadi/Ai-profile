from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_tables
from app.config import get_settings
from app.routers import auth, profile, qrcode_router, documents, chat, webhook, onboarding, dev, payment
from app.seed import seed_dummy_data

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup
    print("🚀 Starting AI Business Card API...")
    await create_tables()
    print("✅ Database tables created/verified")
    await seed_dummy_data()
    yield
    # Shutdown
    print("👋 Shutting down...")


app = FastAPI(
    title="AI Personal Business Card API",
    description="Platform SaaS kartu bisnis AI berbasis QR Code",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.APP_URL,
        "http://localhost",
        "http://localhost:80",
        "http://localhost:3000",
        "http://localhost:3001",
        "https://aidonext.com",
        "http://aidonext.com",
        "https://www.aidonext.com",
        "http://www.aidonext.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(qrcode_router.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(webhook.router)
app.include_router(onboarding.router)
app.include_router(dev.router)
app.include_router(payment.router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "ai-business-card-api",
        "version": "1.0.0",
    }


@app.get("/api")
async def api_info():
    """API info endpoint."""
    return {
        "name": "AI Personal Business Card API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "auth": "/api/auth",
            "profile": "/api/profile",
            "qr": "/api/qr",
            "documents": "/api/documents",
            "chat": "/api/chat",
            "onboarding": "/api/onboarding",
            "webhook": "/api/webhook/stripe",
        },
    }
