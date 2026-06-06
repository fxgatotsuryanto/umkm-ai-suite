import json
import logging

from openai import AsyncOpenAI, APIConnectionError, APIStatusError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.models import BusinessProfile, ContentLibrary, Product
from backend.modules.token_middleware import deduct_token, refund_token

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
    return _client

PLATFORM_STYLES = {
    "instagram": "Visual, engaging, emoji-heavy, hashtag-rich. Maksimal 2200 karakter. Hook kuat di awal.",
    "tiktok": "Super catchy, hook di 3 detik pertama, trendy, CTA jelas. Caption max 150 karakter.",
    "facebook": "Conversational, informatif, boleh panjang. Cocok untuk cerita atau promosi detail.",
    "whatsapp": "Personal, singkat, langsung to the point. Format broadcast WA. Max 300 karakter.",
}

CONTENT_TYPE_DESC = {
    "promo": "konten promosi produk dengan penawaran menarik dan urgency",
    "tips": "tips bermanfaat yang relevan dengan jenis bisnis",
    "produk": "highlight produk unggulan dengan detail dan manfaat yang menarik",
    "behind_the_scenes": "konten behind the scenes yang humanis dan membangun kepercayaan",
    "testimoni": "template konten testimoni pelanggan yang meyakinkan",
}


def _parse_json_safe(raw: str) -> dict:
    text = raw.strip()
    if "```" in text:
        parts = text.split("```")
        text = parts[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    return json.loads(text)


async def generate_content(
    db: AsyncSession,
    platform: str,
    content_type: str,
    topic: str = "",
    product_id: int | None = None,
    license_key: str = "",
) -> dict:
    platform = platform.strip()
    content_type = content_type.strip()
    topic = topic.strip()

    if not platform:
        return {"success": False, "content": None, "error": "Platform tidak boleh kosong."}
    if not content_type:
        return {"success": False, "content": None, "error": "Jenis konten tidak boleh kosong."}

    token_ok = await deduct_token(db, "content_generate", license_key=license_key)
    if not token_ok:
        return {
            "success": False,
            "content": None,
            "error": "Saldo token tidak cukup. Butuh 5 token.",
        }

    profile_result = await db.execute(
        select(BusinessProfile)
        .where(BusinessProfile.license_key == license_key)
        .limit(1)
    )
    profile = profile_result.scalar_one_or_none()
    business_name = (profile.name if profile else settings.BUSINESS_NAME).strip() or "Toko Kami"

    product_info = ""
    if product_id:
        product_result = await db.execute(
            select(Product).where(
                Product.id == product_id,
                Product.license_key == license_key,
            )
        )
        product = product_result.scalar_one_or_none()
        if product:
            product_info = (
                f"\nFokus Produk: {product.name}"
                f"\nHarga: Rp{product.price:,.0f}"
                f"\nDeskripsi Produk: {product.description}"
            )

    platform_style = PLATFORM_STYLES.get(platform, PLATFORM_STYLES["instagram"])
    type_desc = CONTENT_TYPE_DESC.get(content_type, content_type)

    extra_lines = []
    if product_info.strip():
        extra_lines.append(product_info.strip())
    if topic:
        extra_lines.append(f"Topik/Tema: {topic}")
    extra_block = ("\n" + "\n".join(extra_lines)) if extra_lines else ""

    prompt = (
        f'Buat {type_desc} untuk platform {platform.upper()} milik bisnis "{business_name}".\n\n'
        f"Panduan gaya {platform.upper()}: {platform_style}"
        f"{extra_block}\n\n"
        "Kembalikan output dalam format JSON berikut (tanpa markdown code fence):\n"
        "{\n"
        '  "title": "judul singkat konten (max 10 kata)",\n'
        '  "content": "isi konten utama sesuai platform",\n'
        '  "hashtags": "#tag1 #tag2 #tag3 (5-10 hashtag relevan)",\n'
        '  "cta": "call to action yang jelas dan actionable"\n'
        "}\n\n"
        "Buat dalam Bahasa Indonesia yang natural, menarik, dan sesuai karakter platform tersebut."
    )

    if not prompt.strip():
        await refund_token(db, "content_generate", license_key=license_key)
        return {"success": False, "content": None, "error": "Gagal membangun prompt konten."}

    try:
        response = await _get_client().chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
            temperature=0.8,
        )
    except APIConnectionError as e:
        await refund_token(db, "content_generate", license_key=license_key)
        logger.error("OpenRouter connection error: %s", e)
        return {
            "success": False,
            "content": None,
            "error": f"Tidak dapat terhubung ke AI provider: {str(e)}",
        }
    except APIStatusError as e:
        await refund_token(db, "content_generate", license_key=license_key)
        logger.error("OpenRouter API error %s: %s", e.status_code, e.message)
        return {
            "success": False,
            "content": None,
            "error": f"AI provider error ({e.status_code}): {e.message}",
        }
    except Exception as e:
        await refund_token(db, "content_generate", license_key=license_key)
        logger.exception("Unexpected error calling AI provider")
        return {
            "success": False,
            "content": None,
            "error": f"Error tidak terduga: {str(e)}",
        }

    raw = response.choices[0].message.content
    try:
        result = _parse_json_safe(raw)
    except (json.JSONDecodeError, IndexError):
        logger.warning("Model returned non-JSON, storing raw content")
        result = {"title": "", "content": raw, "hashtags": "", "cta": ""}

    record = ContentLibrary(
        license_key=license_key,
        platform=platform,
        content_type=content_type,
        title=result.get("title", ""),
        content=result.get("content", ""),
        hashtags=result.get("hashtags", ""),
        cta=result.get("cta", ""),
        tokens_used=5,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return {
        "success": True,
        "id": record.id,
        "platform": platform,
        "content_type": content_type,
        "title": result.get("title", ""),
        "content": result.get("content", ""),
        "hashtags": result.get("hashtags", ""),
        "cta": result.get("cta", ""),
        "tokens_used": 5,
        "created_at": record.created_at.isoformat(),
    }
