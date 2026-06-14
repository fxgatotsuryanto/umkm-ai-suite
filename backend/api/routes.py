import csv
import io
import time
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.database import get_db
from backend.db.models import (
    BusinessProfile,
    ChatHistory,
    ContentLibrary,
    FAQ,
    Product,
    TokenLedger,
    WebChatConfig,
    WebChatMessage,
    WebChatSession,
)
from backend.modules.content_ai import generate_content
from backend.modules.token_middleware import (
    add_token,
    get_balance,
    get_unsynced_transactions,
    mark_synced,
    push_unsynced_to_cloud,
    sync_balance_from_cloud,
    _get_or_create_balance,
)

from backend.modules.wa_reply import generate_wa_reply
from backend.modules.webchat import handle_webchat

router = APIRouter()

# ── Auth cache ────────────────────────────────────────────────────────────────

_license_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL = 300  # 5 minutes


async def _validate_license(key: str) -> Optional[dict]:
    now = time.time()
    if key in _license_cache:
        data, ts = _license_cache[key]
        if now - ts < _CACHE_TTL:
            return data

    # Fast path: key matches local env config
    if settings.CLOUD_API_KEY and key == settings.CLOUD_API_KEY:
        data = {"business_name": settings.BUSINESS_NAME}
        _license_cache[key] = (data, now)
        return data

    # Validate against cloud
    cloud_url = settings.CLOUD_API_URL.rstrip("/")
    if cloud_url:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(
                    f"{cloud_url}/license/validate",
                    headers={"x-api-key": key},
                )
            if r.status_code == 200:
                data = r.json()
                _license_cache[key] = (data, now)
                return data
        except Exception:
            pass

    return None


async def get_license_key(x_api_key: str = Header(...)) -> str:
    info = await _validate_license(x_api_key)
    if not info:
        raise HTTPException(status_code=401, detail="License key tidak valid atau expired")
    return x_api_key


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class WAReplyRequest(BaseModel):
    wa_number: str
    message: str
    customer_name: str = ""
    webhook_secret: str = ""


class ContentRequest(BaseModel):
    platform: str
    content_type: str
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


class LoginRequest(BaseModel):
    license_key: str


class AdminTokenRequest(BaseModel):
    amount: int
    reason: str = "admin_topup"



# ── Admin ─────────────────────────────────────────────────────────────────────

def _get_admin_key() -> str:
    """Kembalikan ADMIN_API_KEY jika di-set, fallback ke SECRET_KEY."""
    return (settings.ADMIN_API_KEY or settings.SECRET_KEY).strip()


@router.post("/admin/token/add", tags=["Admin"])
async def admin_add_token(
    req: AdminTokenRequest,
    x_admin_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Tambah token lokal secara manual (tanpa cloud sync).
    Berguna saat CLOUD_API_KEY belum dikonfigurasi atau untuk testing.
    Header: X-Admin-Key: <ADMIN_API_KEY atau SECRET_KEY>
    """
    admin_key = _get_admin_key()
    if not x_admin_key or x_admin_key != admin_key:
        raise HTTPException(status_code=401, detail="Admin key tidak valid")
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Jumlah token harus lebih dari 0")

    new_balance = await add_token(db, req.amount, action=req.reason)
    return {
        "success": True,
        "added": req.amount,
        "new_balance": new_balance,
        "message": f"Berhasil menambah {req.amount} token",
    }


@router.get("/admin/status", tags=["Admin"])
async def admin_status(
    x_admin_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Cek status konfigurasi backend (environment variables, token, dll).
    Header: X-Admin-Key: <ADMIN_API_KEY atau SECRET_KEY>
    """
    admin_key = _get_admin_key()
    if not x_admin_key or x_admin_key != admin_key:
        raise HTTPException(status_code=401, detail="Admin key tidak valid")

    balance_info = await get_balance(db)
    return {
        "app": settings.APP_NAME,
        "config": {
            "openai_configured": bool(settings.OPENAI_API_KEY),
            "openai_model": settings.OPENAI_MODEL,
            "cloud_url": settings.CLOUD_API_URL,
            "cloud_configured": bool(
                settings.CLOUD_API_KEY
                and settings.CLOUD_API_URL != "https://your-cloud.railway.app"
            ),
            "cors_origins": settings.CORS_ORIGINS or "*",
            "business_name": settings.BUSINESS_NAME,
            "initial_token_balance": settings.INITIAL_TOKEN_BALANCE,
        },
        "token": balance_info,
    }


@router.post("/admin/token/set-package", tags=["Admin"])
async def admin_set_package(
    package: str,
    expires_days: int = 365,
    x_admin_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Set paket dan tanggal kadaluarsa token secara manual.
    Header: X-Admin-Key: <ADMIN_API_KEY atau SECRET_KEY>
    """
    from datetime import datetime, timedelta

    admin_key = _get_admin_key()
    if not x_admin_key or x_admin_key != admin_key:
        raise HTTPException(status_code=401, detail="Admin key tidak valid")

    valid_packages = {"starter", "growth", "pro", "custom"}
    if package not in valid_packages:
        raise HTTPException(
            status_code=400,
            detail=f"Package harus salah satu dari: {', '.join(valid_packages)}",
        )

    token = await _get_or_create_balance(db)
    token.package = package
    token.expires_at = datetime.utcnow() + timedelta(days=expires_days)
    await db.commit()
    await db.refresh(token)

    return {
        "success": True,
        "package": token.package,
        "expires_at": token.expires_at.isoformat(),
        "balance": token.balance,
        "message": f"Paket berhasil diset ke '{package}', berlaku {expires_days} hari",
    }


# ── Auth ──────────────────────────────────────────────────────────────────────


@router.post("/auth/login", tags=["Auth"])
async def login(req: LoginRequest):
    key = req.license_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="License key tidak boleh kosong")

    if settings.CLOUD_API_KEY and key == settings.CLOUD_API_KEY:
        return {"success": True, "business_name": settings.BUSINESS_NAME}

    if settings.CLOUD_API_URL:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(
                    f"{settings.CLOUD_API_URL}/license/validate",
                    headers={"x-api-key": key},
                )
            if r.status_code == 200:
                data = r.json()
                return {
                    "success": True,
                    "business_name": data.get("business_name", settings.BUSINESS_NAME),
                    "package": data.get("package", ""),
                    "expires_at": data.get("expires_at"),
                }
        except Exception:
            pass

    raise HTTPException(status_code=401, detail="License key tidak valid")


@router.get("/auth/me", tags=["Auth"])
async def auth_me(license_key: str = Depends(get_license_key)):
    return {
        "configured": True,
        "business_name": settings.BUSINESS_NAME,
        "license_key": license_key[:8] + "****",
    }


# ── License Validation (Compatibility) ────────────────────────────────────────

@router.get("/license/validate", tags=["License"])
async def license_validate(
    x_api_key: Optional[str] = Header(None),
):
    """
    Endpoint kompatibilitas untuk validasi license key.
    Header: X-API-Key: <license_key>
    """
    key = (x_api_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="License key tidak boleh kosong")

    # Validasi lokal: cocokkan dengan CLOUD_API_KEY yang di-set di env
    if settings.CLOUD_API_KEY and key == settings.CLOUD_API_KEY:
        return {
            "valid": True,
            "business_name": settings.BUSINESS_NAME,
            "package": "local",
            "expires_at": None,
        }

    # Validasi via cloud server jika CLOUD_API_URL di-set
    if settings.CLOUD_API_URL and settings.CLOUD_API_URL != "https://your-cloud.railway.app":
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(
                    f"{settings.CLOUD_API_URL}/license/validate",
                    headers={"x-api-key": key},
                )
            if r.status_code == 200:
                data = r.json()
                # Simpan key sebagai CLOUD_API_KEY runtime jika belum di-set
                if not settings.CLOUD_API_KEY:
                    settings.CLOUD_API_KEY = key
                return {
                    "valid": True,
                    "business_name": data.get("business_name", settings.BUSINESS_NAME),
                    "package": data.get("package", ""),
                    "expires_at": data.get("expires_at"),
                }
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Validasi cloud gagal: {str(e)}")

    raise HTTPException(status_code=401, detail="License key tidak valid")


# ── WA Auto-Reply ─────────────────────────────────────────────────────────────

@router.post("/wa/reply", tags=["WhatsApp"])
async def wa_reply(
    req: WAReplyRequest,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    if settings.N8N_WEBHOOK_SECRET and req.webhook_secret != settings.N8N_WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Webhook secret tidak valid")

    return await generate_wa_reply(
        db=db,
        wa_number=req.wa_number,
        message=req.message,
        customer_name=req.customer_name,
        license_key=license_key,
    )


@router.get("/wa/chats", tags=["WhatsApp"])
async def list_chats(
    limit: int = 50,
    wa_number: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    query = (
        select(ChatHistory)
        .where(ChatHistory.license_key == license_key)
        .order_by(desc(ChatHistory.created_at))
        .limit(limit)
    )
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
async def content_generate(
    req: ContentRequest,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
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
        license_key=license_key,
    )


@router.get("/content/library", tags=["Content"])
async def content_library(
    platform: Optional[str] = None,
    content_type: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    query = (
        select(ContentLibrary)
        .where(ContentLibrary.license_key == license_key)
        .order_by(desc(ContentLibrary.created_at))
        .limit(limit)
    )
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
async def token_balance(
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    await sync_balance_from_cloud(db, license_key=license_key)
    return await get_balance(db, license_key)


@router.post("/token/sync-cloud", tags=["Token"])
async def token_sync_cloud(
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    pushed = await push_unsynced_to_cloud(db, license_key)
    cloud_data = await sync_balance_from_cloud(db, force=True, license_key=license_key)
    local = await get_balance(db, license_key)
    return {
        "pushed": pushed,
        "balance": local["balance"],
        "package": local["package"],
        "expires_at": local["expires_at"],
        "cloud_synced": cloud_data is not None,
        "message": "Sinkronisasi selesai" if cloud_data else "Sync lokal saja (cloud tidak tersedia)",
    }


@router.post("/token/sync-offline", tags=["Token"])
async def token_sync_offline(
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    pushed = await push_unsynced_to_cloud(db, license_key)
    if pushed == 0:
        unsynced = await get_unsynced_transactions(db, license_key)
        if not unsynced:
            return {"synced": 0, "message": "Tidak ada transaksi yang perlu disinkronkan"}
        return {"synced": 0, "message": "Gagal terhubung ke cloud"}
    return {"synced": pushed, "message": "Sinkronisasi berhasil"}


# ── Products ──────────────────────────────────────────────────────────────────

@router.get("/products", tags=["Products"])
async def list_products(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    query = (
        select(Product)
        .where(Product.license_key == license_key)
        .order_by(Product.name)
    )
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
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    product = Product(
        license_key=license_key,
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
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.license_key == license_key)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    await db.delete(product)
    await db.commit()
    return {"message": "Produk berhasil dihapus"}


# ── FAQs ──────────────────────────────────────────────────────────────────────

@router.get("/faqs", tags=["FAQ"])
async def list_faqs(
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    query = (
        select(FAQ)
        .where(FAQ.is_active == True, FAQ.license_key == license_key)  # noqa: E712
        .order_by(FAQ.category)
    )
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
async def create_faq(
    data: FAQCreate,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    faq = FAQ(
        license_key=license_key,
        question=data.question,
        answer=data.answer,
        category=data.category,
    )
    db.add(faq)
    await db.commit()
    await db.refresh(faq)
    return {"id": faq.id, "message": "FAQ berhasil ditambahkan"}


@router.delete("/faqs/{faq_id}", tags=["FAQ"])
async def delete_faq(
    faq_id: int,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    result = await db.execute(
        select(FAQ).where(FAQ.id == faq_id, FAQ.license_key == license_key)
    )
    faq = result.scalar_one_or_none()
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ tidak ditemukan")
    await db.delete(faq)
    await db.commit()
    return {"message": "FAQ berhasil dihapus"}


# ── Business Profile ──────────────────────────────────────────────────────────

@router.get("/profile", tags=["Profile"])
async def get_profile(
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    result = await db.execute(
        select(BusinessProfile)
        .where(BusinessProfile.license_key == license_key)
        .limit(1)
    )
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
async def update_profile(
    data: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    result = await db.execute(
        select(BusinessProfile)
        .where(BusinessProfile.license_key == license_key)
        .limit(1)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        profile = BusinessProfile(license_key=license_key)
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
    business_key: str = ""  # public widget sends business_key instead of x-api-key


@router.post("/webchat/message", tags=["WebChat"])
async def webchat_message(
    req: WebChatRequest,
    db: AsyncSession = Depends(get_db),
    x_api_key: Optional[str] = Header(default=None),
):
    # Widget visitors don't have a license key; use business_key from body or header
    effective_key = req.business_key or x_api_key or ""
    return await handle_webchat(db, req.session_id, req.message, effective_key)


@router.get("/webchat/history/{session_id}", tags=["WebChat"])
async def webchat_history(
    session_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
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
    license_key: str = Depends(get_license_key),
):
    query = (
        select(WebChatSession)
        .where(WebChatSession.license_key == license_key)
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
async def webchat_widget_config(
    business_key: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    x_api_key: Optional[str] = Header(default=None),
):
    # Public endpoint — widget uses business_key query param or x-api-key header
    effective_key = business_key or x_api_key or ""
    cfg_res = await db.execute(
        select(WebChatConfig)
        .where(WebChatConfig.license_key == effective_key)
        .limit(1)
    )
    cfg = cfg_res.scalar_one_or_none()
    profile_res = await db.execute(
        select(BusinessProfile)
        .where(BusinessProfile.license_key == effective_key)
        .limit(1)
    )
    profile = profile_res.scalar_one_or_none()
    return {
        "business_name": (
            profile.name if profile and profile.name
            else (cfg.agent_name if cfg else "AI Assistant")
        ),
        "agent_name":    cfg.agent_name   if cfg else "AI Assistant",
        "greeting":      cfg.greeting     if cfg else "Halo! Ada yang bisa saya bantu? \U0001f60a",
        "theme_color":   cfg.theme_color  if cfg else "#16a34a",
        "auto_open":     cfg.auto_open    if cfg else False,
        "cta_wa_number": cfg.cta_wa_number if cfg else "",
    }


# ── WebChat Config (CRUD) ─────────────────────────────────────────────────────

class WebChatConfigUpdate(BaseModel):
    agent_name: Optional[str] = None
    greeting: Optional[str] = None
    theme_color: Optional[str] = None
    system_prompt_extra: Optional[str] = None
    cta_wa_number: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    webhook_url: Optional[str] = None
    auto_open: Optional[bool] = None


@router.get("/webchat/config", tags=["WebChat"])
async def get_webchat_config(
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    res = await db.execute(
        select(WebChatConfig)
        .where(WebChatConfig.license_key == license_key)
        .limit(1)
    )
    cfg = res.scalar_one_or_none()
    if not cfg:
        cfg = WebChatConfig(license_key=license_key)
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
    return {
        "agent_name":           cfg.agent_name,
        "greeting":             cfg.greeting,
        "theme_color":          cfg.theme_color,
        "system_prompt_extra":  cfg.system_prompt_extra,
        "cta_wa_number":        cfg.cta_wa_number,
        "telegram_chat_id":     cfg.telegram_chat_id,
        "webhook_url":          cfg.webhook_url,
        "auto_open":            cfg.auto_open,
        "updated_at":           cfg.updated_at.isoformat(),
    }


@router.put("/webchat/config", tags=["WebChat"])
async def update_webchat_config(
    data: WebChatConfigUpdate,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    res = await db.execute(
        select(WebChatConfig)
        .where(WebChatConfig.license_key == license_key)
        .limit(1)
    )
    cfg = res.scalar_one_or_none()
    if not cfg:
        cfg = WebChatConfig(license_key=license_key)
        db.add(cfg)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(cfg, field, value)

    await db.commit()
    await db.refresh(cfg)
    return {"message": "Konfigurasi webchat berhasil diperbarui"}


# ── WebChat Leads Export ──────────────────────────────────────────────────────

@router.get("/webchat/leads/export", tags=["WebChat"])
async def export_webchat_leads(
    captured_only: bool = True,
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    query = (
        select(WebChatSession)
        .where(WebChatSession.license_key == license_key)
        .order_by(desc(WebChatSession.last_active))
    )
    if captured_only:
        query = query.where(WebChatSession.lead_captured == True)  # noqa: E712
    res = await db.execute(query)
    sessions = res.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Nama", "WA", "Email", "Kebutuhan", "Solusi", "Tanggal", "Session ID"])
    for s in sessions:
        writer.writerow([
            s.visitor_name,
            s.visitor_wa,
            s.visitor_email,
            s.kebutuhan,
            s.solusi,
            s.created_at.strftime("%Y-%m-%d %H:%M"),
            s.session_id,
        ])

    output.seek(0)
    filename = f"leads_webchat_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats", tags=["Stats"])
async def get_stats(
    db: AsyncSession = Depends(get_db),
    license_key: str = Depends(get_license_key),
):
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_start  = today_start - timedelta(days=today_start.weekday())

    wa_today_res = await db.execute(
        select(func.count(ChatHistory.id)).where(
            ChatHistory.license_key == license_key,
            ChatHistory.created_at >= today_start,
        )
    )
    wa_total_res = await db.execute(
        select(func.count(ChatHistory.id)).where(ChatHistory.license_key == license_key)
    )

    wc_today_res = await db.execute(
        select(func.count(WebChatSession.id)).where(
            WebChatSession.license_key == license_key,
            WebChatSession.created_at >= today_start,
        )
    )
    wc_total_res = await db.execute(
        select(func.count(WebChatSession.id)).where(
            WebChatSession.license_key == license_key
        )
    )

    leads_today_res = await db.execute(
        select(func.count(WebChatSession.id)).where(
            WebChatSession.license_key == license_key,
            WebChatSession.lead_captured == True,  # noqa: E712
            WebChatSession.created_at >= today_start,
        )
    )
    leads_total_res = await db.execute(
        select(func.count(WebChatSession.id)).where(
            WebChatSession.license_key == license_key,
            WebChatSession.lead_captured == True,  # noqa: E712
        )
    )

    content_today_res = await db.execute(
        select(func.count(ContentLibrary.id)).where(
            ContentLibrary.license_key == license_key,
            ContentLibrary.created_at >= today_start,
        )
    )
    content_total_res = await db.execute(
        select(func.count(ContentLibrary.id)).where(
            ContentLibrary.license_key == license_key
        )
    )

    tokens_today_res = await db.execute(
        select(func.sum(TokenLedger.amount)).where(
            TokenLedger.license_key == license_key,
            TokenLedger.amount < 0,
            TokenLedger.created_at >= today_start,
        )
    )
    tokens_week_res = await db.execute(
        select(func.sum(TokenLedger.amount)).where(
            TokenLedger.license_key == license_key,
            TokenLedger.amount < 0,
            TokenLedger.created_at >= week_start,
        )
    )

    return {
        "today": {
            "wa_chats":          wa_today_res.scalar() or 0,
            "webchat_sessions":  wc_today_res.scalar() or 0,
            "webchat_leads":     leads_today_res.scalar() or 0,
            "content_generated": content_today_res.scalar() or 0,
            "tokens_used":       abs(tokens_today_res.scalar() or 0),
        },
        "week": {
            "tokens_used": abs(tokens_week_res.scalar() or 0),
        },
        "total": {
            "wa_chats":          wa_total_res.scalar() or 0,
            "webchat_sessions":  wc_total_res.scalar() or 0,
            "webchat_leads":     leads_total_res.scalar() or 0,
            "content_generated": content_total_res.scalar() or 0,
        },
    }
