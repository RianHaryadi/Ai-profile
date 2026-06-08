from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from collections.abc import AsyncGenerator
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=20,
    max_overflow=10,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


from sqlalchemy.types import TypeDecorator, DateTime
from datetime import timezone

class SafeDateTime(TypeDecorator):
    """
    SQLAlchemy TypeDecorator to strip timezone info (make naive UTC)
    when writing to a TIMESTAMP WITHOUT TIME ZONE column in PostgreSQL,
    and add UTC tzinfo when reading.
    """
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if value.tzinfo is not None:
                return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
        return value


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields a database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    """Create all tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        from sqlalchemy import text
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS midtrans_order_id VARCHAR UNIQUE;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR DEFAULT 'standard';"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP;"))
            await conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_theme JSONB;"))
            await conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS qr_style JSONB;"))
        except Exception as e:
            print(f"[Migration] Warning: Could not run ALTER TABLE: {e}")
