import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base, SafeDateTime


class Profile(Base):
    """
    Profile model — public-facing profile data for a user's business card.
    Contains name, bio, photo, social links, and products/services.
    """
    __tablename__ = "profiles"

    id: uuid.UUID = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    name: str | None = Column(String, nullable=True)
    bio: str | None = Column(Text, nullable=True)
    photo_url: str | None = Column(String, nullable=True)           # path in MinIO
    links: dict | None = Column(JSONB, nullable=True, default=dict)  # social media, website, etc.
    products: list | None = Column(JSONB, nullable=True, default=list)  # products/services offered
    custom_theme: dict | None = Column(JSONB, nullable=True, default=dict)  # premium custom design / colors
    qr_style: dict | None = Column(JSONB, nullable=True, default=dict)  # premium custom QR code styles
    updated_at: datetime = Column(SafeDateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="profile")

    def __repr__(self):
        return f"<Profile {self.name}>"
