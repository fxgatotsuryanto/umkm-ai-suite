from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.database import get_db
from backend.db.models import (
    BusinessProfile,
    ChatHistory,
    ContentLibrary,
    FAQ,
    Product,
    WebChatSession,
    WebChatMessage,
)
from backend.modules.content_ai import generate_content
from backend.modules.token_middleware import (
    add_token,
    get_balance,
    get_unsynced_transactions,
    mark_synced,
)
from backend.modules.wa_reply import generate_wa_reply
from backend.modules.webchat import handle_webchat

router = APIRouter()


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class WAReplyRequest(BaseModel):
    wa_number: str
    message: str
    customer_name: str = ""
    webhook_secret: str = ""


class ContentRequest(BaseModel):
    platform: str  # instagram | tiktok | facebook | whatsapp
    content_type: str  # promo | tips | produk | behind_the_scenes | testimoni
    topic: str = ""
    product_id: Optional[int] = None


class ProductCreate(BaseModel):
    name: str
    description: str = ""
    price: float
    stock: int = 0
    category: str = ""


class FAQCreate(BaseModel):
    question: str
    answer: str
    category: str = "umum"


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    wa_greeting: Optional[str] = None


# ── WA Auto-Reply ─────────────────────────────────────────────────────────────

@router.post("/wa/reply", tags=["WhatsApp"])
async def wa_reply(req: WAReplyRequest, db: AsyncSession = Depends(get_db)):
    if settings.N8N_WEBHOOK_SECRET and req.webhook_secret != settings.N8N_WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Webhook secret tidak valid")

    result = await generate_wa_reply(
        db=db,
        wa_number=req.wa_number,
        message=req.message,
        customer_name=req.customer_name,
    )
    return result


@router.get("/wa/chats", tags=["WhatsApp"])
async def list_chats(
    limit: int = 50,
    wa_number: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(ChatHistory).order_by(desc(ChatHistory.created_at)).limit(limit)
    if wa_number:
        query = query.where(ChatHistory.wa_number == wa_number)
    result = await db.execute(query)
    chats = result.scalars().all()
    return [
        {
            "id": c.id,
            "wa_number": c.wa_number,
            "customer_name": c.customer_name,
            "message_in": c.message_in,
            "message_out": c.message_out,
            "tokens_used": c.tokens_used,
            "created_at": c.created_at.isoformat(),
        }
        for c in chats
    ]


# ── Content Marketing ─────────────────────────────────────────────────────────

@router.post("/content/generate", tags=["Content"])
async def content_generate(req: ContentRequest, db: AsyncSession = Depends(get_db)):
    valid_platforms = {"instagram", "tiktok", "facebook", "whatsapp"}
    if req.platform not in valid_platforms:
        raise HTTPException(
            status_code=400,
            detail=f"Platform harus salah satu dari: {', '.join(valid_platforms)}",
        )
    return await generate_content(
        db=db,
        platform=req.platform,
        content_type=req.content_type,
        topic=req.topic,
        product_id=req.product_id,
    )


@router.get("/content/library", tags=["Content"])
async def content_library(
    platform: Optional[str] = None,
    content_type: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    query = select(ContentLibrary).order_by(desc(ContentLibrary.created_at)).limit(limit)
    if platform:
        query = query.where(ContentLibrary.platform == platform)
    if content_type:
        query = query.where(ContentLibrary.content_type == content_type)
    result = await db.execute(query)
    items = result.scalars().all()
    return [
        {
            "id": i.id,
            "platform": i.platform,
            "content_type": i.content_type,
            "title": i.title,
            "content": i.content,
            "hashtags": i.hashtags,
            "cta": i.cta,
            "tokens_used": i.tokens_used,
            "created_at": i.created_at.isoformat(),
        }
        for i in items
    ]


# ── Token ─────────────────────────────────────────────────────────────────────

@router.get("/token/balance", tags=["Token"])
async def token_balance(db: AsyncSession = Depends(get_db)):
    return await get_balance(db)


@router.post("/token/sync-offline", tags=["Token"])
async def token_sync_offline(db: AsyncSession = Depends(get_db)):
    unsynced = await get_unsynced_transactions(db)
    if not unsynced:
        return {"synced": 0, "message": "Tidak ada transaksi yang perlu disinkronkan"}

    payload = [
        {
            "id": t.id,
            "action": t.action,
            "amount": t.amount,
            "balance_after": t.balance_after,
            "reference_id": t.reference_id,
            "created_at": t.created_at.isoformat(),
        }
        for t in unsynced
    ]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{settings.CLOUD_API_URL}/api/sync/transactions",
                json={"transactions": payload, "api_key": settings.CLOUD_API_KEY},
            )
        if response.status_code == 200:
            await mark_synced(db, [t.id for t in unsynced])
            return {"synced": len(unsynced), "message": "Sinkronisasi berhasil"}
        return {"synced": 0, "message": f"Cloud error: {response.status_code}"}
    except Exception as e:
        return {"synced": 0, "message": f"Gagal terhubung ke cloud: {str(e)}"}


# ── Products ──────────────────────────────────────────────────────────────────

@router.get("/products", tags=["Products"])
async def list_products(
    active_only: bool = True, db: AsyncSession = Depends(get_db)
):
    query = select(Product).order_by(Product.name)
    if active_only:
        query = query.where(Product.is_active == True)  # noqa: E712
    result = await db.execute(query)
    products = result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "price": p.price,
            "stock": p.stock,
            "category": p.category,
            "is_active": p.is_active,
            "created_at": p.created_at.isoformat(),
        }
        for p in products
    ]


@router.post("/products", tags=["Products"])
async def create_product(data: ProductCreate, db: AsyncSession = Depends(get_db)):
    product = Product(
        name=data.name,
        description=data.description,
        price=data.price,
        stock=data.stock,
        category=data.category,
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return {"id": product.id, "name": product.name, "message": "Produk berhasil ditambahkan"}


@router.delete("/products/{product_id}", tags=["Products"])
async def delete_product(product_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    await db.delete(product)
    await db.commit()
    return {"message": "Produk berhasil dihapus"}


# ── FAQs ──────────────────────────────────────────────────────────────────────

@router.get("/faqs", tags=["FAQ"])
async def list_faqs(
    category: Optional[str] = None, db: AsyncSession = Depends(get_db)
):
    query = select(FAQ).where(FAQ.is_active == True).order_by(FAQ.category)  # noqa: E712
    if category:
        query = query.where(FAQ.category == category)
    result = await db.execute(query)
    faqs = result.scalars().all()
    return [
        {
            "id": f.id,
            "question": f.question,
            "answer": f.answer,
            "category": f.category,
            "created_at": f.created_at.isoformat(),
        }
        for f in faqs
    ]


@router.post("/faqs", tags=["FAQ"])
async def create_faq(data: FAQCreate, db: AsyncSession = Depends(get_db)):
    faq = FAQ(question=data.question, answer=data.answer, category=data.category)
    db.add(faq)
    await db.commit()
    await db.refresh(faq)
    return {"id": faq.id, "message": "FAQ berhasil ditambahkan"}


@router.delete("/faqs/{faq_id}", tags=["FAQ"])
async def delete_faq(faq_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FAQ).where(FAQ.id == faq_id))
    faq = result.scalar_one_or_none()
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ tidak ditemukan")
    await db.delete(faq)
    await db.commit()
    return {"message": "FAQ berhasil dihapus"}


# ── Business Profile ──────────────────────────────────────────────────────────

@router.get("/profile", tags=["Profile"])
async def get_profile(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BusinessProfile).limit(1))
    profile = result.scalar_one_or_none()
    if not profile:
        return {"message": "Profil belum diatur", "profile": None}
    return {
        "id": profile.id,
        "name": profile.name,
        "type": profile.type,
        "description": profile.description,
        "phone": profile.phone,
        "address": profile.address,
        "wa_greeting": profile.wa_greeting,
        "updated_at": profile.updated_at.isoformat(),
    }


@router.put("/profile", tags=["Profile"])
async def update_profile(data: ProfileUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BusinessProfile).limit(1))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = BusinessProfile()
        db.add(profile)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return {"message": "Profil berhasil diperbarui", "id": profile.id}


# ── Web Chat ──────────────────────────────────────────────────────────────────

class WebChatRequest(BaseModel):
    session_id: str
    message: str


@router.post("/webchat/message", tags=["WebChat"])
async def webchat_message(req: WebChatRequest, db: AsyncSession = Depends(get_db)):
    return await handle_webchat(db, req.session_id, req.message)


@router.get("/webchat/history/{session_id}", tags=["WebChat"])
async def webchat_history(
    session_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(WebChatMessage)
        .where(WebChatMessage.session_id == session_id)
        .order_by(WebChatMessage.created_at)
        .limit(limit)
    )
    msgs = res.scalars().all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]


@router.get("/webchat/leads", tags=["WebChat"])
async def webchat_leads(
    limit: int = 50,
    captured_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(WebChatSession)
        .order_by(desc(WebChatSession.last_active))
        .limit(limit)
    )
    if captured_only:
        query = query.where(WebChatSession.lead_captured == True)  # noqa: E712
    res = await db.execute(query)
    sessions = res.scalars().all()
    return [
        {
            "session_id": s.session_id,
            "visitor_name": s.visitor_name,
            "visitor_wa": s.visitor_wa,
            "visitor_email": s.visitor_email,
            "kebutuhan": s.kebutuhan,
            "solusi": s.solusi,
            "lead_captured": s.lead_captured,
            "created_at": s.created_at.isoformat(),
            "last_active": s.last_active.isoformat(),
        }
        for s in sessions
    ]


@router.get("/webchat/widget-config", tags=["WebChat"])
async def webchat_widget_config(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(BusinessProfile).limit(1))
    profile = res.scalar_one_or_none()
    return {
        "business_name": profile.name if profile else "AI Assistant",
        "greeting": (
            profile.wa_greeting
            if profile
            else "Halo! Ada yang bisa saya bantu? 😊"
        ),
        "theme_color": "#16a34a",
    }
