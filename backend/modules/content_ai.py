import json

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.models import BusinessProfile, ContentLibrary, Product
from backend.modules.token_middleware import deduct_token

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

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


async def generate_content(
    db: AsyncSession,
    platform: str,
    content_type: str,
    topic: str = "",
    product_id: int | None = None,
) -> dict:
    token_ok = await deduct_token(db, "content_generate")
    if not token_ok:
        return {
            "success": False,
            "content": None,
            "error": "Saldo token tidak cukup. Butuh 5 token.",
        }

    profile_result = await db.execute(select(BusinessProfile).limit(1))
    profile = profile_result.scalar_one_or_none()
    business_name = profile.name if profile else settings.BUSINESS_NAME

    product_info = ""
    if product_id:
        product_result = await db.execute(
            select(Product).where(Product.id == product_id)
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

    prompt = f"""Buat {type_desc} untuk platform {platform.upper()} milik bisnis "{business_name}".

Panduan gaya {platform.upper()}: {platform_style}
{product_info}
{f"Topik/Tema: {topic}" if topic else ""}

Kembalikan output dalam format JSON berikut (tanpa markdown):
{{
  "title": "judul singkat konten (max 10 kata)",
  "content": "isi konten utama sesuai platform",
  "hashtags": "#tag1 #tag2 #tag3 (5-10 hashtag relevan)",
  "cta": "call to action yang jelas dan actionable"
}}

Buat dalam Bahasa Indonesia yang natural, menarik, dan sesuai karakter platform tersebut."""

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=800,
        temperature=0.8,
        response_format={"type": "json_object"},
    )

    result = json.loads(response.choices[0].message.content)

    record = ContentLibrary(
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
