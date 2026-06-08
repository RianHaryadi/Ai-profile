import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base, SafeDateTime


class Document(Base):
    """
    Document model — tracks uploaded PDF files.
    Status transitions: pending → processed | failed
    """
    __tablename__ = "documents"

    id: uuid.UUID = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename: str = Column(String, nullable=False)
    file_url: str = Column(String, nullable=False)           # path in MinIO
    status: str = Column(String, default="pending")          # pending, processed, failed
    created_at: datetime = Column(SafeDateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="documents")
    embeddings = relationship("Embedding", back_populates="document", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Document {self.filename} ({self.status})>"
