import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base, SafeDateTime


class User(Base):
    """
    User model — represents a paying customer.
    Access is controlled via magic link tokens (zero login experience).
    """
    __tablename__ = "users"

    id: uuid.UUID = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: str = Column(String, unique=True, nullable=False, index=True)
    slug: str = Column(String, unique=True, nullable=False, index=True)
    access_token: str | None = Column(String, nullable=True)       # hashed magic link token
    token_expires: datetime | None = Column(SafeDateTime, nullable=True)
    stripe_id: str | None = Column(String, nullable=True)           # Stripe customer ID
    stripe_subscription_id: str | None = Column(String, nullable=True)
    midtrans_order_id: str | None = Column(String, nullable=True, unique=True, index=True)
    is_active: bool = Column(Boolean, default=False)          # active if subscription active
    subscription_tier: str = Column(String, default="standard")  # standard, pro, lifetime
    subscription_expires_at: datetime | None = Column(SafeDateTime, nullable=True)
    created_at: datetime = Column(SafeDateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    profile = relationship("Profile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    embeddings = relationship("Embedding", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.email} ({self.slug})>"
