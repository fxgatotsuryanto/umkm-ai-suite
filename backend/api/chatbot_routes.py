from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.db.models import ChatbotConfig, ChatMessage, ChatSession
from backend.modules.chatbot import process_message

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    user_identifier: str
    session_id: Optional[str] = None
    config_id: Optional[int] = None
    user_name: str = ""
    webhook_secret: str = ""


class ConfigCreate(BaseModel):
    name: str
    slug: str
    description: str = ""
    system_prompt: str = ""
    personality_tone: str = "ramah"
    token_cost: int = 2
    max_history: int = 10
    webhook_secret: str = ""


class ConfigUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    personality_tone: Optional[str] = None
    token_cost: Optional[int] = None
    max_history: Optional[int] = None
    webhook_secret: Optional[str] = None
    is_active: Optional[bool] = None


# ── Chat endpoint (called by n8n) ─────────────────────────────────────────────

@router.post("/chat")
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    """
    Main chatbot endpoint — dipanggil oleh n8n atau integrasi lain.

    Session otomatis dibuat jika session_id belum ada.
    Gunakan format session_id: "{config_id}_{wa_number}" agar tiap user
    punya sesi terpisah per chatbot.
    """
    if req.config_id:
        result = await db.execute(
            select(ChatbotConfig).where(ChatbotConfig.id == req.config_id)
        )
        config = result.scalar_one_or_none()
        if config and config.webhook_secret and req.webhook_secret != config.webhook_secret:
            raise HTTPException(status_code=401, detail="Webhook secret tidak valid")

    return await process_message(
        db=db,
        message=req.message,
        user_identifier=req.user_identifier,
        session_id=req.session_id,
        config_id=req.config_id,
        user_name=req.user_name,
    )


# ── Config CRUD ───────────────────────────────────────────────────────────────

@router.get("/configs")
async def list_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatbotConfig).order_by(desc(ChatbotConfig.created_at))
    )
    configs = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "slug": c.slug,
            "description": c.description,
            "system_prompt": c.system_prompt,
            "personality_tone": c.personality_tone,
            "token_cost": c.token_cost,
            "max_history": c.max_history,
            "is_active": c.is_active,
            "created_at": c.created_at.isoformat(),
        }
        for c in configs
    ]


@router.post("/configs")
async def create_config(data: ConfigCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(ChatbotConfig).where(ChatbotConfig.slug == data.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Slug '{data.slug}' sudah digunakan")

    config = ChatbotConfig(**data.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return {"id": config.id, "slug": config.slug, "message": "Chatbot berhasil dibuat"}


@router.get("/configs/{config_id}")
async def get_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatbotConfig).where(ChatbotConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Chatbot config tidak ditemukan")
    return {
        "id": config.id,
        "name": config.name,
        "slug": config.slug,
        "description": config.description,
        "system_prompt": config.system_prompt,
        "personality_tone": config.personality_tone,
        "token_cost": config.token_cost,
        "max_history": config.max_history,
        "webhook_secret": config.webhook_secret,
        "is_active": config.is_active,
        "created_at": config.created_at.isoformat(),
    }


@router.put("/configs/{config_id}")
async def update_config(
    config_id: int, data: ConfigUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ChatbotConfig).where(ChatbotConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Chatbot config tidak ditemukan")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(config, field, value)
    config.updated_at = datetime.utcnow()

    await db.commit()
    return {"message": "Chatbot berhasil diperbarui"}


@router.delete("/configs/{config_id}")
async def delete_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatbotConfig).where(ChatbotConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Chatbot config tidak ditemukan")
    await db.delete(config)
    await db.commit()
    return {"message": "Chatbot berhasil dihapus"}


# ── Sessions ──────────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    config_id: Optional[int] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ChatSession)
        .order_by(desc(ChatSession.last_activity))
        .limit(limit)
    )
    if config_id:
        query = query.where(ChatSession.config_id == config_id)
    result = await db.execute(query)
    sessions = result.scalars().all()

    out = []
    for s in sessions:
        count_res = await db.execute(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.session_id == s.session_id
            )
        )
        count = count_res.scalar() or 0
        out.append(
            {
                "id": s.id,
                "session_id": s.session_id,
                "config_id": s.config_id,
                "user_identifier": s.user_identifier,
                "user_name": s.user_name,
                "is_active": s.is_active,
                "message_count": count,
                "created_at": s.created_at.isoformat(),
                "last_activity": s.last_activity.isoformat(),
            }
        )
    return out


@router.get("/sessions/{session_id}/messages")
async def get_messages(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    messages = result.scalars().all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "tokens_used": m.tokens_used,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]


@router.delete("/sessions/{session_id}")
async def clear_session(session_id: str, db: AsyncSession = Depends(get_db)):
    msgs_result = await db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id)
    )
    for msg in msgs_result.scalars().all():
        await db.delete(msg)

    sess_result = await db.execute(
        select(ChatSession).where(ChatSession.session_id == session_id)
    )
    session = sess_result.scalar_one_or_none()
    if session:
        session.is_active = False

    await db.commit()
    return {"message": "Sesi berhasil direset"}
