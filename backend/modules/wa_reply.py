import logging

from openai import AsyncOpenAI, APIConnectionError, APIStatusError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.models import BusinessProfile, ChatHistory, FAQ, Product
from backend.modules.token_middleware import deduct_token, refund_token

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
    return _client


async def _build_context(db: AsyncSession) -> str:
    profile_result = await db.execute(select(BusinessProfile).limit(1))
    profile = profile_result.scalar_one_or_none()

    products_result = await db.execute(
        select(Product).where(Product.is_active == True).limit(20)  # noqa: E712
    )
    products = products_result.scalars().all()

    faqs_result = await db.execute(
        select(FAQ).where(FAQ.is_active == True).limit(30)  # noqa: E712
    )
    faqs = faqs_result.scalars().all()

    parts = []
    if profile:
        parts.append(f"Nama Bisnis: {profile.name}")
        if profile.description:
            parts.append(f"Deskripsi: {profile.description}")

    if products:
        parts.append("\nDaftar Produk:")
        for p in products:
            parts.append(f"- {p.name}: Rp{p.price:,.0f} (stok: {p.stock})")

    if faqs:
        parts.append("\nFAQ:")
        for f in faqs:
            parts.append(f"Q: {f.question}\nA: {f.answer}")

    return "\n".join(parts) if parts else "Tidak ada informasi bisnis tersedia."


async def generate_wa_reply(
    db: AsyncSession,
    wa_number: str,
    message: str,
    customer_name: str = "",
) -> dict:
    message = message.strip()
    if not message:
        return {
            "success": False,
            "reply": "Pesan tidak boleh kosong.",
            "tokens_used": 0,
            "error": "Pesan masuk kosong atau hanya spasi.",
        }

    token_ok = await deduct_token(db, "wa_reply", reference_id=wa_number)
    if not token_ok:
        return {
            "success": False,
            "reply": "Maaf, saldo token habis. Silakan hubungi admin untuk isi ulang.",
            "tokens_used": 0,
        }

    context = await _build_context(db)

    system_prompt = f"""Kamu adalah asisten WhatsApp untuk sebuah UMKM. Jawab pertanyaan pelanggan dengan ramah, singkat, dan informatif dalam Bahasa Indonesia.

Informasi Bisnis:
{context}

Aturan:
1. Jawab sesuai informasi yang tersedia di atas
2. Jika tidak ada info yang relevan, minta pelanggan hubungi langsung
3. Gunakan bahasa yang ramah, natural, dan profesional
4. Jawab singkat (maksimal 3 paragraf)
5. Jika ada pertanyaan harga, sebutkan langsung
6. Gunakan emoji secukupnya agar terasa personal"""

    try:
        response = await _get_client().chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            max_tokens=500,
            temperature=0.7,
        )
    except APIConnectionError as e:
        await refund_token(db, "wa_reply", reference_id=wa_number)
        logger.error("OpenRouter connection error: %s", e)
        return {
            "success": False,
            "reply": "Maaf, AI sedang tidak dapat dihubungi. Silakan coba lagi.",
            "tokens_used": 0,
            "error": str(e),
        }
    except APIStatusError as e:
        await refund_token(db, "wa_reply", reference_id=wa_number)
        logger.error("OpenRouter API error %s: %s", e.status_code, e.message)
        return {
            "success": False,
            "reply": "Maaf, terjadi kesalahan pada layanan AI. Silakan coba lagi.",
            "tokens_used": 0,
            "error": f"{e.status_code}: {e.message}",
        }
    except Exception as e:
        await refund_token(db, "wa_reply", reference_id=wa_number)
        logger.exception("Unexpected error calling AI provider")
        return {
            "success": False,
            "reply": "Maaf, terjadi kesalahan tidak terduga.",
            "tokens_used": 0,
            "error": str(e),
        }

    reply = response.choices[0].message.content

    chat = ChatHistory(
        wa_number=wa_number,
        customer_name=customer_name,
        message_in=message,
        message_out=reply,
        tokens_used=2,
    )
    db.add(chat)
    await db.commit()
    await db.refresh(chat)

    return {
        "success": True,
        "reply": reply,
        "tokens_used": 2,
        "chat_id": chat.id,
    }
