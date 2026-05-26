import logging
import uuid
from datetime import datetime

from openai import AsyncOpenAI, APIConnectionError, APIStatusError
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.models import (
    BusinessProfile, ChatbotConfig, ChatMessage, ChatSession, FAQ, Product,
)
from backend.modules.token_middleware import deduct_token_amount, refund_token_amount

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)


async def _build_business_context(db: AsyncSession) -> str:
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
        if profile.name:
            parts.append(f"Nama Bisnis: {profile.name}")
        if profile.description:
            parts.append(f"Deskripsi: {profile.description}")
        if profile.wa_greeting:
            parts.append(f"Sapaan: {profile.wa_greeting}")

    if products:
        parts.append("\nDaftar Produk:")
        for p in products:
            line = f"- {p.name}: Rp{p.price:,.0f} (stok: {p.stock})"
            if p.description:
                line += f" — {p.description}"
            parts.append(line)

    if faqs:
        parts.append("\nFAQ:")
        for f in faqs:
            parts.append(f"Q: {f.question}\nA: {f.answer}")

    return "\n".join(parts) if parts else ""


async def _get_or_create_session(
    db: AsyncSession,
    session_id: str,
    config_id: int | None,
    user_identifier: str,
    user_name: str = "",
) -> ChatSession:
    result = await db.execute(
        select(ChatSession).where(ChatSession.session_id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        session = ChatSession(
            session_id=session_id,
            config_id=config_id,
            user_identifier=user_identifier,
            user_name=user_name,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
    return session


async def _get_session_history(
    db: AsyncSession,
    session_id: str,
    max_messages: int = 10,
) -> list[dict]:
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(desc(ChatMessage.created_at))
        .limit(max_messages)
    )
    messages = list(reversed(result.scalars().all()))
    return [{"role": m.role, "content": m.content} for m in messages]


async def process_message(
    db: AsyncSession,
    message: str,
    user_identifier: str,
    session_id: str | None = None,
    config_id: int | None = None,
    user_name: str = "",
) -> dict:
    message = message.strip()
    if not message:
        return {
            "success": False,
            "reply": "Pesan tidak boleh kosong.",
            "tokens_used": 0,
            "error": "Pesan kosong",
        }

    # Load chatbot config
    config: ChatbotConfig | None = None
    if config_id:
        result = await db.execute(
            select(ChatbotConfig).where(
                ChatbotConfig.id == config_id,
                ChatbotConfig.is_active == True,  # noqa: E712
            )
        )
        config = result.scalar_one_or_none()

    token_cost = config.token_cost if config else 2
    max_history = config.max_history if config else 10
    config_slug = config.slug if config else "default"

    # Generate session_id if not provided
    if not session_id:
        session_id = str(uuid.uuid4())

    # Get or create session
    session = await _get_or_create_session(db, session_id, config_id, user_identifier, user_name)

    # Deduct tokens (syncs to cloud via ledger)
    action = f"chatbot_{config_slug}"
    ok = await deduct_token_amount(db, token_cost, action, reference_id=session_id)
    if not ok:
        return {
            "success": False,
            "reply": "Maaf, saldo token habis. Silakan hubungi admin untuk isi ulang.",
            "tokens_used": 0,
            "session_id": session_id,
        }

    # Build system prompt
    business_context = await _build_business_context(db)

    if config and config.system_prompt:
        system_prompt = config.system_prompt
        if business_context:
            system_prompt += f"\n\nInformasi Bisnis:\n{business_context}"
    else:
        tone_map = {
            "ramah": "ramah dan hangat",
            "profesional": "profesional dan formal",
            "casual": "santai dan akrab",
            "formal": "formal dan sopan",
        }
        tone = tone_map.get(config.personality_tone if config else "ramah", "ramah dan hangat")
        system_prompt = f"""Kamu adalah asisten AI yang {tone} untuk sebuah bisnis UMKM Indonesia. Jawab pertanyaan pelanggan dengan singkat dan informatif dalam Bahasa Indonesia.

{f"Informasi Bisnis:{chr(10)}{business_context}" if business_context else ""}

Aturan:
1. Jawab sesuai informasi yang tersedia
2. Jika tidak ada informasi yang relevan, sampaikan dengan sopan
3. Gunakan bahasa yang {tone}
4. Jawab singkat (maksimal 3 paragraf)
5. Sebutkan harga jika ditanya
6. Gunakan emoji secukupnya agar terasa personal"""

    # Load conversation history
    history = await _get_session_history(db, session_id, max_history)

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": message})

    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=600,
            temperature=0.7,
        )
    except (APIConnectionError, APIStatusError, Exception) as e:
        await refund_token_amount(db, token_cost, action, reference_id=session_id)
        logger.exception("Chatbot AI error")
        return {
            "success": False,
            "reply": "Maaf, AI sedang tidak dapat dihubungi. Silakan coba lagi.",
            "tokens_used": 0,
            "session_id": session_id,
            "error": str(e),
        }

    reply = (response.choices[0].message.content or "").strip()

    # Save messages to session history
    user_msg = ChatMessage(session_id=session_id, role="user", content=message, tokens_used=0)
    ai_msg = ChatMessage(session_id=session_id, role="assistant", content=reply, tokens_used=token_cost)
    db.add(user_msg)
    db.add(ai_msg)

    # Update session last_activity
    session.last_activity = datetime.utcnow()

    await db.commit()

    return {
        "success": True,
        "reply": reply,
        "tokens_used": token_cost,
        "session_id": session_id,
        "config_id": config_id,
    }
