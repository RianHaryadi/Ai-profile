import uuid
import io
import pdfplumber
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db, async_session
from app.models.user import User
from app.models.document import Document
from app.routers.auth import get_current_user
from app.services.storage import storage_service
from app.services.rag import rag_service

router = APIRouter(prefix="/api/documents", tags=["documents"])


class DocumentResponse(BaseModel):
    id: str
    filename: str
    status: str
    created_at: str

    class Config:
        from_attributes = True


async def _process_document_background(doc_id: str, user_id: str, file_path: str):
    """Background task to process uploaded document through RAG pipeline."""
    async with async_session() as db:
        try:
            result = await db.execute(select(Document).where(Document.id == uuid.UUID(doc_id)))
            document = result.scalar_one_or_none()
            if not document:
                return

            # Get file from MinIO
            pdf_bytes = storage_service.get_file(file_path)

            # Process through RAG pipeline
            await rag_service.process_document(db, document, pdf_bytes)

        except Exception as e:
            print(f"[Documents] Background processing failed for {doc_id}: {e}")
            # Update status to failed
            result = await db.execute(select(Document).where(Document.id == uuid.UUID(doc_id)))
            document = result.scalar_one_or_none()
            if document:
                document.status = "failed"
                await db.commit()


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    token: str = Query(...),
    uid: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a PDF document for AI processing.
    File is saved to MinIO, then processed asynchronously (extract → chunk → embed).
    Enforces upload limits based on user subscription tier.
    """
    user = await get_current_user(token, uid, db)

    # Validate file type
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Hanya file PDF yang didukung")

    # Fetch existing documents count
    result = await db.execute(
        select(Document).where(Document.user_id == user.id)
    )
    existing_docs = result.scalars().all()

    # Determine limits based on tier
    tier = (user.subscription_tier or "standard").lower()
    if tier == "standard":
        max_files = 1
        max_size = 2 * 1024 * 1024
        max_pages = 5
    elif tier == "pro":
        max_files = 5
        max_size = 20 * 1024 * 1024
        max_pages = 30
    elif tier == "lifetime":
        max_files = 999999
        max_size = 50 * 1024 * 1024  # 50MB max file size (matching Nginx)
        max_pages = 999999
    else:  # fallback
        max_files = 5
        max_size = 20 * 1024 * 1024
        max_pages = 30

    if len(existing_docs) >= max_files:
        limit_text = "Unlimited" if tier == "lifetime" else f"{max_files}"
        raise HTTPException(
            status_code=400,
            detail=f"Maksimal {limit_text} dokumen untuk paket {tier.capitalize()}. Silakan hapus dokumen yang ada untuk mengupload dokumen baru."
        )

    # Read file
    content = await file.read()
    if len(content) > max_size:
        size_mb = max_size // (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"Ukuran file maksimal {size_mb}MB untuk paket {tier.capitalize()}."
        )

    # Validate page count using pdfplumber
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            num_pages = len(pdf.pages)
            if num_pages > max_pages:
                raise HTTPException(
                    status_code=400,
                    detail=f"Jumlah halaman berkas PDF ({num_pages} halaman) melebihi batas maksimal paket {tier.capitalize()} ({max_pages} halaman)."
                )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Documents] Error parsing PDF for page count: {e}")
        raise HTTPException(
            status_code=400,
            detail="Gagal membaca halaman berkas PDF. Pastikan file PDF tidak rusak."
        )

    # Upload to MinIO
    doc_id = uuid.uuid4()
    file_path = f"users/{user.id}/documents/{doc_id}/{file.filename}"
    storage_service.upload_file(file_path, content, file.content_type)

    # Create document record
    document = Document(
        id=doc_id,
        user_id=user.id,
        filename=file.filename,
        file_url=file_path,
        status="pending",
    )
    db.add(document)
    await db.commit()

    # Process in background (extract → chunk → embed)
    background_tasks.add_task(
        _process_document_background,
        str(doc_id),
        str(user.id),
        file_path,
    )

    return {
        "message": "Dokumen berhasil diupload dan sedang diproses",
        "document_id": str(doc_id),
        "filename": file.filename,
    }


@router.get("/", response_model=List[DocumentResponse])
async def list_documents(
    token: str = Query(...),
    uid: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """List all documents for the authenticated user."""
    user = await get_current_user(token, uid, db)

    result = await db.execute(
        select(Document)
        .where(Document.user_id == user.id)
        .order_by(Document.created_at.desc())
    )
    documents = result.scalars().all()

    return [
        DocumentResponse(
            id=str(doc.id),
            filename=doc.filename,
            status=doc.status,
            created_at=doc.created_at.isoformat() if doc.created_at else "",
        )
        for doc in documents
    ]


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    token: str = Query(...),
    uid: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Delete a document and its embeddings."""
    user = await get_current_user(token, uid, db)

    result = await db.execute(
        select(Document).where(
            Document.id == uuid.UUID(doc_id),
            Document.user_id == user.id,
        )
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")

    # Delete from MinIO
    try:
        storage_service.delete_file(document.file_url)
    except Exception:
        pass  # File might already be deleted

    # Delete document (cascade deletes embeddings)
    await db.delete(document)
    await db.commit()

    return {"message": "Dokumen berhasil dihapus"}
