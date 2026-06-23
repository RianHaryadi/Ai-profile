import uuid
from typing import List, Optional
import pdfplumber
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from langchain.text_splitter import RecursiveCharacterTextSplitter
from openai import OpenAI

from app.config import get_settings
from app.models.embedding import Embedding
from app.models.document import Document
from app.models.profile import Profile
from app.models.user import User

settings = get_settings()
openai_client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
    base_url=settings.OPENAI_BASE_URL,
)


class RAGService:
    """
    RAG (Retrieval-Augmented Generation) pipeline service.
    Handles: PDF extraction → chunking → embedding → similarity search → LLM response.
    
    IMPORTANT: All queries MUST filter by user_id to prevent data leakage.
    """

    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def _model_chain(self) -> List[str]:
        """Ordered list of LLM models to try (fallback router)."""
        raw = (settings.LLM_MODELS or settings.LLM_MODEL or "").strip()
        return [m.strip() for m in raw.split(",") if m.strip()]

    def _chat_complete(self, messages, max_tokens, temperature=0.3, **kwargs):
        """
        Call the LLM with automatic fallback across the model chain.
        Tries each model in order; on error or empty reply, moves to the next.
        Returns the first valid completion, or raises if all models fail.
        """
        last_err = None
        for model in self._model_chain():
            try:
                resp = openai_client.chat.completions.create(
                    model=model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    **kwargs,
                )
                content = resp.choices[0].message.content
                if content and content.strip():
                    print(f"[RAG] LLM responded via: {model}")
                    return resp
                print(f"[RAG] Empty reply from {model}, trying next model...")
            except Exception as e:
                last_err = e
                print(f"[RAG] Model {model} failed ({str(e)[:100]}), trying next...")
        raise last_err or RuntimeError("No LLM model in chain returned a response")

    def extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        """Extract all text from a PDF file."""
        import io
        text_parts = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n\n".join(text_parts)

    def chunk_text(self, text: str) -> List[str]:
        """Split text into overlapping chunks for embedding."""
        return self.text_splitter.split_text(text)

    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding vector using OpenAI API (or compatible proxy)."""
        kwargs = {
            "model": settings.EMBEDDING_MODEL,
            "input": text,
        }
        if settings.EMBEDDING_DIMENSIONS:
            kwargs["dimensions"] = settings.EMBEDDING_DIMENSIONS

        response = openai_client.embeddings.create(**kwargs)
        return response.data[0].embedding

    def extract_profile_from_text(self, text: str) -> dict:
        """Extract structured profile data from text using LLM."""
        prompt = f"""Kamu adalah asisten ekstraksi data AI. Tugasmu adalah membaca teks profil bisnis/personal di bawah ini dan mengekstrak informasi profil terstruktur dalam format JSON.

TEKS:
\"\"\"
{text[:8000]}
\"\"\"

Kembalikan objek JSON dengan struktur berikut:
{{
  "name": "Nama lengkap orang atau bisnis (string)",
  "bio": "Bio singkat atau ringkasan profil (string)",
  "links": {{
    "website": "URL website (jika ada, string)",
    "whatsapp": "Nomor WhatsApp atau URL chat (jika ada, string)",
    "instagram": "URL Instagram (jika ada, string)",
    "linkedin": "URL LinkedIn (jika ada, string)",
    "tiktok": "URL TikTok (jika ada, string)",
    "youtube": "URL YouTube (jika ada, string)",
    "github": "URL GitHub (jika ada, string)",
    "email": "Alamat email (jika ada, string)"
  }},
  "products": [
    {{
      "name": "Nama produk atau layanan (string)",
      "price": "Harga produk jika dicantumkan, misal: Rp 150.000 atau Hubungi kami (string)",
      "description": "Deskripsi singkat tentang produk/layanan (string)"
    }}
  ]
}}

Jika suatu platform link tidak ditemukan di teks, jangan masukkan ke objek "links". Jika tidak ada produk, biarkan array "products" kosong.
Kembalikan HANYA teks JSON mentah. Jangan tambahkan penjelasan apa pun."""

        import json
        import re

        messages = [
            {"role": "system", "content": "Kamu adalah asisten ekstraksi data JSON yang hanya mengembalikan objek JSON valid."},
            {"role": "user", "content": prompt}
        ]

        # Try with JSON response format first (router picks the model)
        try:
            response = self._chat_complete(
                messages, max_tokens=1500, temperature=0.1,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            return json.loads(content)
        except Exception as e:
            print(f"[RAG] Failed to extract profile with response_format: {e}. Trying fallback...")

            # Fallback: call without response_format and clean up markdown blocks
            try:
                response = self._chat_complete(messages, max_tokens=1500, temperature=0.1)
                content = response.choices[0].message.content
                
                # Extract json code block if wrapped in ```json ... ```
                json_match = re.search(r'\{.*\}', content, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group(0))
                return json.loads(content)
            except Exception as e2:
                print(f"[RAG] Fallback profile extraction failed: {e2}")
                return {}

    async def process_document(
        self,
        db: AsyncSession,
        document: Document,
        pdf_bytes: bytes,
    ):
        """
        Full document processing pipeline:
        1. Extract text from PDF
        2. Automatically extract and populate Profile info
        3. Chunk text
        4. Generate embeddings (respecting tier chunk limits)
        5. Store in pgvector
        """
        try:
            # Update status to processing
            document.status = "processing"
            await db.commit()

            # Get user tier to enforce chunk limits
            user_result = await db.execute(
                select(User).where(User.id == document.user_id)
            )
            user = user_result.scalar_one_or_none()
            tier = (user.subscription_tier or "standard").lower() if user else "standard"
            if tier == "standard":
                max_chunks = 50
            elif tier == "pro":
                max_chunks = 300
            elif tier == "lifetime":
                max_chunks = 999999  # Unlimited
            else:
                max_chunks = 300

            # Count existing chunks
            count_result = await db.execute(
                select(Embedding).where(Embedding.user_id == document.user_id)
            )
            existing_chunks = count_result.scalars().all()
            existing_count = len(existing_chunks)

            # Check if user already reached their limit
            allowed_new_chunks = max_chunks - existing_count
            if allowed_new_chunks <= 0:
                print(f"[RAG] Halted document processing for {document.id}: Chunk limit of {max_chunks} reached")
                document.status = "processed"
                await db.commit()
                return

            # Extract text
            full_text = self.extract_text_from_pdf(pdf_bytes)
            if not full_text.strip():
                document.status = "failed"
                await db.commit()
                return

            # Automatically extract profile data and populate user's profile if it's currently empty
            try:
                result = await db.execute(
                    select(Profile).where(Profile.user_id == document.user_id)
                )
                profile = result.scalar_one_or_none()
                if not profile:
                    profile = Profile(user_id=document.user_id)
                    db.add(profile)

                # Only extract and auto-fill if profile fields are mostly empty
                if not profile.name or not profile.bio or not profile.links or not profile.products:
                    extracted_data = self.extract_profile_from_text(full_text)
                    if extracted_data:
                        if (not profile.name or profile.name == user.slug) and extracted_data.get("name"):
                            profile.name = extracted_data.get("name")
                        if not profile.bio and extracted_data.get("bio"):
                            profile.bio = extracted_data.get("bio")
                        
                        # Merge links
                        if extracted_data.get("links"):
                            existing_links = profile.links or {}
                            for platform, url in extracted_data.get("links").items():
                                if platform not in existing_links and url:
                                    existing_links[platform] = url
                            profile.links = existing_links

                        # Merge products
                        if extracted_data.get("products"):
                            existing_products = profile.products or []
                            if len(existing_products) == 0:
                                profile.products = extracted_data.get("products")
                            
                        await db.commit()
                        print(f"[RAG] Automatically populated profile for user {document.user_id} from document {document.id}")
            except Exception as pe:
                print(f"[RAG] Error auto-populating profile: {pe}")

            # Chunk text
            chunks = self.chunk_text(full_text)

            # Limit chunks to fit within the tier limits
            chunks_to_embed = chunks[:allowed_new_chunks]

            # Generate embeddings and store
            for chunk in chunks_to_embed:
                embedding_vector = self.generate_embedding(chunk)
                
                embedding = Embedding(
                    id=uuid.uuid4(),
                    user_id=document.user_id,
                    doc_id=document.id,
                    content=chunk,
                    embedding=embedding_vector,
                )
                db.add(embedding)

            document.status = "processed"
            await db.commit()
            print(f"[RAG] Processed document {document.id}: {len(chunks_to_embed)} chunks generated (limit: {max_chunks})")

        except Exception as e:
            document.status = "failed"
            await db.commit()
            print(f"[RAG] Failed to process document {document.id}: {e}")
            raise

    async def similarity_search(
        self,
        db: AsyncSession,
        query: str,
        user_id: str,
        top_k: int = None,
    ) -> List[dict]:
        """
        Perform similarity search in pgvector.
        ALWAYS filters by user_id for data isolation.
        """
        if top_k is None:
            top_k = settings.TOP_K_RESULTS

        # Generate query embedding
        query_embedding = self.generate_embedding(query)

        # Perform similarity search using pgvector
        # Using cosine distance operator <=>
        result = await db.execute(
            text("""
                SELECT content, 1 - (embedding <=> CAST(:query_embedding AS vector)) as similarity
                FROM embeddings
                WHERE user_id = :user_id
                ORDER BY embedding <=> CAST(:query_embedding AS vector)
                LIMIT :top_k
            """),
            {
                "query_embedding": str(query_embedding),
                "user_id": str(user_id),
                "top_k": top_k,
            }
        )

        rows = result.fetchall()
        return [{"content": row[0], "similarity": float(row[1])} for row in rows]

    async def generate_response(
        self,
        query: str,
        context_chunks: List[dict],
        profile_name: str = "pemilik kartu",
        profile: Optional[Profile] = None,
        history: Optional[List[dict]] = None,
        tier: str = "standard",
    ) -> str:
        """
        Generate LLM response using retrieved context, profile data, and conversation history.
        AI only answers based on provided context and profile details.
        """
        # Format profile information
        profile_info = ""
        has_profile_data = False
        if profile:
            has_profile_data = True
            products_list = []
            if profile.products:
                for idx, prod in enumerate(profile.products, 1):
                    prod_name = prod.get("name", "Produk")
                    prod_desc = prod.get("description", "")
                    prod_price = prod.get("price", "")
                    price_str = f" - Harga: {prod_price}" if prod_price else ""
                    desc_str = f" ({prod_desc})" if prod_desc else ""
                    products_list.append(f"  {idx}. {prod_name}{price_str}{desc_str}")
            
            products_str = "\n".join(products_list) if products_list else "  (Belum ada produk/layanan yang ditambahkan)"
            
            links_list = []
            if profile.links:
                for platform, url in profile.links.items():
                    links_list.append(f"  - {platform}: {url}")
            links_str = "\n".join(links_list) if links_list else "  (Belum ada link sosial media)"

            profile_info = f"""
PROFIL UTAMA PEMILIK KARTU:
- Nama: {profile.name or profile_name}
- Bio singkat: {profile.bio or "Tidak ada deskripsi bio"}
- Produk & Layanan yang Ditawarkan:
{products_str}
- Kontak & Sosial Media:
{links_str}
"""

        context = "\n\n---\n\n".join([chunk["content"] for chunk in context_chunks])

        # If we have absolutely no info at all, fallback immediately
        if not context.strip() and not has_profile_data:
            return (
                f"Maaf, saya belum memiliki informasi yang cukup untuk menjawab pertanyaan tersebut. "
                f"Silakan tanyakan hal lain tentang {profile_name}, atau hubungi langsung untuk informasi lebih lanjut."
            )

        system_prompt = f"""Kamu adalah asisten AI untuk kartu bisnis {profile_name}. 
Tugasmu adalah menjawab pertanyaan pengunjung berdasarkan HANYA data yang tersedia di bawah ini.

ATURAN:
1. Jawab dengan ramah, hangat, profesional, dan dalam Bahasa Indonesia
2. HANYA gunakan informasi dari profil utama pemilik kartu dan context tambahan yang diberikan
3. Jika informasi tidak tersedia di profil utama maupun context tambahan, katakan sopan bahwa informasi tersebut belum tersedia
4. Jangan mengakhiri percakapan secara kaku (misal: hindari template penutup seperti "Jika butuh info hubungi langsung, terima kasih" di setiap pesan). Tetap ramah dan biarkan pengunjung terus bertanya. Tawarkan bantuan lanjutan secara natural di akhir jawaban Anda (misalnya: "Apakah ada hal lain yang ingin Anda ketahui tentang produk kami?" atau "Ada yang bisa saya bantu lagi?").
5. Jangan mengarang atau menambahkan informasi yang tidak ada di data yang disediakan
6. Jawab secara ringkas dan to-the-point

{profile_info}

CONTEXT TAMBAHAN DOKUMEN (Jika ada):
{context}"""

        messages = [{"role": "system", "content": system_prompt}]
        
        # Inject conversation history if available
        if history:
            for turn in history:
                messages.append({
                    "role": turn.get("role", "user"),
                    "content": turn.get("content", "")
                })
                
        # Append the current query
        messages.append({"role": "user", "content": query})

        # Token limit based on tier (the router picks the model automatically)
        max_tokens = 400 if tier == "standard" else 500

        response = self._chat_complete(messages, max_tokens=max_tokens, temperature=0.3)
        return response.choices[0].message.content

    async def chat(
        self,
        db: AsyncSession,
        query: str,
        user_id: str,
        profile_name: str = "pemilik kartu",
        profile: Optional[Profile] = None,
        history: Optional[List[dict]] = None,
    ) -> str:
        """
        Full RAG chat pipeline:
        1. Similarity search for relevant chunks
        2. Generate response with LLM
        """
        # Fetch user's subscription tier
        user_result = await db.execute(
            select(User).where(User.id == (uuid.UUID(user_id) if isinstance(user_id, str) else user_id))
        )
        user = user_result.scalar_one_or_none()
        tier = (user.subscription_tier or "standard").lower() if user else "standard"

        # Find relevant context.
        # Embeddings may be unavailable (e.g. chat-only LLM proxy with no embedding
        # provider). In that case fall back to answering from profile data only.
        try:
            context_chunks = await self.similarity_search(db, query, user_id)
        except Exception as e:
            print(f"[RAG] Similarity search skipped (embedding unavailable): {e}")
            context_chunks = []

        # Generate response
        response = await self.generate_response(query, context_chunks, profile_name, profile, history, tier=tier)
        return response


# Singleton instance
rag_service = RAGService()
