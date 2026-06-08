import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from typing import Any
from pgvector.sqlalchemy import Vector
from app.database import Base, SafeDateTime


class Embedding(Base):
    """
    Embedding model — stores vector embeddings from document chunks.
    Uses pgvector VECTOR(1536) for OpenAI text-embedding-3-small dimensions.
    All queries MUST filter by user_id to prevent data leakage.
    """
    __tablename__ = "embeddings"

    id: uuid.UUID = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_id: uuid.UUID | None = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=True)
    content: str = Column(Text, nullable=False)              # original text chunk
    embedding: Any = Column(Vector(1536), nullable=False)    # vector embedding
    created_at: datetime = Column(SafeDateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="embeddings")
    document = relationship("Document", back_populates="embeddings")

    def __repr__(self):
        return f"<Embedding {self.id} (user={self.user_id})>"
