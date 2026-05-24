"""
UMKM AI Suite — Cloud Server
Token Master, License Management & Admin Dashboard

Deploy: Railway / Render / VPS
Docs:   GET /docs

Environment Variables:
  MASTER_API_KEY  — Password untuk admin panel (wajib di production)
  JWT_SECRET      — Secret JWT (wajib di production)
  CORS_ORIGINS    — Comma-separated allowed origins
  DATABASE_URL    — MySQL/MariaDB/SQLite URL (auto-set by Railway MySQL plugin)
"""

import os
import secrets
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from pydantic_settings import BaseSettings
from sqlalchemy import Boolean, DateTime, Integer, String, Text, select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# ── Config ─────────────────────────────────────────────────────────────────────

class CloudSettings(BaseSettings):
    MASTER_API_KEY:      str = "dev-master-key-change-in-production"
    JWT_SECRET:          str = "dev-jwt-secret-change-in-production"
    CORS_ORIGINS:        str = "*"
    MIDTRANS_SERVER_KEY: str = ""
    XENDIT_SECRET_KEY:   str = ""
    DATABASE_URL:        str = "sqlite+aiosqlite:///./umkm_cloud.db"

    class Config:
        env_file = ".env"
        extra    = "ignore"

cloud_settings = CloudSettings()

# Normalise URL for async drivers
_db_url = cloud_settings.DATABASE_URL
if _db_url.startswith("mysql://"):
    _db_url = _db_url.replace("mysql://", "mysql+aiomysql://", 1)
elif _db_url.startswith("mariadb://"):
    _db_url = _db_url.replace("mariadb://", "mysql+aiomysql://", 1)

ADMIN_HTML = Path(__file__).parent / "admin" / "index.html"

PACKAGES = {
    "starter": {"tokens": 500,   "price": 49000},
    "growth":  {"tokens": 1500,  "price": 99000},
    "pro":     {"tokens": -1,    "price": 199000},
}

# ── Database ───────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class License(Base):
    __tablename__ = "licenses"
    key:           Mapped[str]               = mapped_column(String(120), primary_key=True)
    business_name: Mapped[str]               = mapped_column(String(200))
    email:         Mapped[str]               = mapped_column(String(200))
    package:       Mapped[str]               = mapped_column(String(50))
    expires_at:    Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at:    Mapped[datetime]           = mapped_column(DateTime)
    disabled:      Mapped[bool]               = mapped_column(Boolean, default=False)


class TokenAccount(Base):
    __tablename__ = "token_accounts"
    license_key: Mapped[str] = mapped_column(String(120), primary_key=True)
    balance:     Mapped[int] = mapped_column(Integer, default=0)
    package:     Mapped[str] = mapped_column(String(50))


class Transaction(Base):
    __tablename__ = "transactions"
    id:            Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    license_key:   Mapped[str]      = mapped_column(String(120))
    business_name: Mapped[str]      = mapped_column(String(200), default="")
    action:        Mapped[str]      = mapped_column(String(50))
    amount:        Mapped[int]      = mapped_column(Integer)
    balance_after: Mapped[int]      = mapped_column(Integer)
    reason:        Mapped[str]      = mapped_column(Text, default="")
    reference_id:  Mapped[str]      = mapped_column(String(200), default="")
    created_at:    Mapped[datetime] = mapped_column(DateTime)


_engine = create_async_engine(_db_url, echo=False)
_Session = async_sessionmaker(_engine, expire_on_commit=False)


async def get_db():
    async with _Session() as session:
        yield session


# ── Startup ────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="UMKM AI Suite — Cloud Server",
    description="Token master, license management, dan billing",
    version="2.0.0",
    lifespan=lifespan,
)

_cors = cloud_settings.CORS_ORIGINS.split(",") if cloud_settings.CORS_ORIGINS != "*" else ["*"]
app.add_middleware(CORSMiddleware, allow_origins=_cors, allow_methods=["*"], allow_headers=["*"])

# ── Auth helpers ───────────────────────────────────────────────────────────────

def require_master_key(x_api_key: str = Header(...)):
    if x_api_key != cloud_settings.MASTER_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid master API key")


async def require_license_key(x_api_key: str = Header(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(License).where(License.key == x_api_key))
    lic = result.scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=401, detail="License key tidak valid atau expired")
    if lic.expires_at and lic.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="License expired")
    return lic


# ── Helpers ────────────────────────────────────────────────────────────────────

def _is_active(lic: License) -> bool:
    if lic.disabled:
        return False
    if lic.expires_at:
        return lic.expires_at > datetime.utcnow()
    return True


async def _log_tx(db: AsyncSession, license_key: str, business_name: str,
                  action: str, amount: int, balance_after: int,
                  reason: str = "", reference_id: str = "") -> Transaction:
    tx = Transaction(
        license_key=license_key,
        business_name=business_name,
        action=action,
        amount=amount,
        balance_after=balance_after,
        reason=reason,
        reference_id=reference_id,
        created_at=datetime.utcnow(),
    )
    db.add(tx)
    await db.flush()
    return tx


# ── Schemas ────────────────────────────────────────────────────────────────────

class IssueLicenseRequest(BaseModel):
    business_name: str
    email: str
    package: str
    months: int = 1


class SyncTransactionsRequest(BaseModel):
    api_key: str
    transactions: list[dict]


class TopupRequest(BaseModel):
    license_key: str
    amount: int
    payment_reference: str


class UserUpdateRequest(BaseModel):
    active:  Optional[bool] = None
    package: Optional[str]  = None


class TokenAdjustRequest(BaseModel):
    license_key: str
    amount: int
    reason: str = ""


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/", tags=["health"])
async def root():
    return {"service": "UMKM AI Suite Cloud", "status": "running", "panel": "/panel"}


@app.get("/packages", tags=["Billing"])
async def list_packages():
    return {"packages": PACKAGES}


@app.get("/license/validate", tags=["License"])
async def validate_license(lic: License = Depends(require_license_key)):
    return {
        "valid": True,
        "business_name": lic.business_name,
        "email": lic.email,
        "package": lic.package,
        "expires_at": lic.expires_at.isoformat() if lic.expires_at else None,
    }


@app.get("/token/balance", tags=["Token"])
async def cloud_token_balance(lic: License = Depends(require_license_key),
                               db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TokenAccount).where(TokenAccount.license_key == lic.key))
    acct = result.scalar_one_or_none()
    return {
        "balance":    acct.balance if acct else 0,
        "package":    acct.package if acct else lic.package,
        "expires_at": lic.expires_at.isoformat() if lic.expires_at else None,
    }


@app.post("/api/sync/transactions", tags=["Sync"])
async def sync_transactions(req: SyncTransactionsRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(License).where(License.key == req.api_key))
    lic = result.scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=401, detail="API key tidak valid")

    result = await db.execute(
        select(TokenAccount).where(TokenAccount.license_key == req.api_key))
    acct = result.scalar_one_or_none()
    if not acct:
        acct = TokenAccount(license_key=req.api_key, balance=0, package=lic.package)
        db.add(acct)

    debit_total = sum(abs(t["amount"]) for t in req.transactions if t.get("amount", 0) < 0)
    acct.balance = max(0, acct.balance - debit_total)

    for t in req.transactions:
        await _log_tx(db, req.api_key, lic.business_name,
                      t.get("action", "sync"), t.get("amount", 0),
                      acct.balance, reference_id=t.get("reference_id", ""))

    await db.commit()
    return {"accepted": len(req.transactions), "new_balance": acct.balance,
            "message": "Sinkronisasi berhasil"}


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/panel", response_class=HTMLResponse, include_in_schema=False)
async def admin_panel():
    return HTMLResponse(ADMIN_HTML.read_text(encoding="utf-8"))


@app.get("/admin/overview", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_overview(db: AsyncSession = Depends(get_db)):
    now       = datetime.utcnow()
    today_str = now.date().isoformat()
    month_str = now.strftime("%Y-%m")

    licenses = (await db.execute(select(License))).scalars().all()
    total_users  = len(licenses)
    active_users = sum(1 for l in licenses if _is_active(l))

    txs = (await db.execute(select(Transaction))).scalars().all()

    tokens_today = sum(
        abs(t.amount) for t in txs
        if t.created_at.date().isoformat() == today_str
        and t.amount < 0 and t.action != "manual_deduct"
    )

    pkg_prices = {k: v["price"] for k, v in PACKAGES.items()}
    revenue_month = sum(
        pkg_prices.get(l.package, 49000) for l in licenses
        if l.created_at.strftime("%Y-%m") == month_str
    )

    daily_stats = []
    for i in range(6, -1, -1):
        d = (now - timedelta(days=i)).date()
        val = sum(abs(t.amount) for t in txs
                  if t.created_at.date() == d and t.amount < 0)
        daily_stats.append({"label": f"{d.day}/{d.month:02d}", "value": val})

    return {
        "total_users":   total_users,
        "active_users":  active_users,
        "tokens_today":  tokens_today,
        "revenue_month": revenue_month,
        "daily_stats":   daily_stats,
    }


@app.get("/admin/users", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_users(db: AsyncSession = Depends(get_db)):
    licenses = (await db.execute(select(License))).scalars().all()
    users = []
    for lic in licenses:
        result = await db.execute(
            select(TokenAccount).where(TokenAccount.license_key == lic.key))
        acct = result.scalar_one_or_none()
        users.append({
            "key":           lic.key,
            "business_name": lic.business_name,
            "email":         lic.email,
            "package":       lic.package,
            "balance":       acct.balance if acct else 0,
            "active":        _is_active(lic),
            "expires_at":    lic.expires_at.isoformat() if lic.expires_at else None,
            "created_at":    lic.created_at.isoformat(),
        })
    return {"users": users, "total": len(users)}


@app.patch("/admin/users/{key}", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def update_user(key: str, req: UserUpdateRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(License).where(License.key == key))
    lic = result.scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=404, detail="License tidak ditemukan")
    if req.active is not None:
        lic.disabled = not req.active
    if req.package is not None:
        if req.package not in PACKAGES:
            raise HTTPException(status_code=400, detail=f"Package tidak valid: {req.package}")
        lic.package = req.package
        result = await db.execute(
            select(TokenAccount).where(TokenAccount.license_key == key))
        acct = result.scalar_one_or_none()
        if acct:
            acct.package = req.package
    await db.commit()
    return {"message": "User diperbarui", "key": key}


@app.post("/admin/token/adjust", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_token_adjust(req: TokenAdjustRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(License).where(License.key == req.license_key))
    lic = result.scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=404, detail="License tidak ditemukan")

    result = await db.execute(
        select(TokenAccount).where(TokenAccount.license_key == req.license_key))
    acct = result.scalar_one_or_none()
    if not acct:
        acct = TokenAccount(license_key=req.license_key, balance=0, package=lic.package)
        db.add(acct)

    old_balance    = acct.balance
    acct.balance   = max(0, old_balance + req.amount)
    await _log_tx(db, req.license_key, lic.business_name, "manual_adjust",
                  req.amount, acct.balance, reason=req.reason)
    await db.commit()
    return {"message": "Token disesuaikan", "old_balance": old_balance,
            "new_balance": acct.balance, "adjusted": req.amount}


@app.get("/admin/transactions", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_transactions(limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Transaction).order_by(Transaction.created_at.desc()).limit(limit))
    txs = result.scalars().all()
    total = (await db.execute(select(func.count(Transaction.id)))).scalar()
    return {
        "transactions": [
            {
                "id":            t.id,
                "license_key":   t.license_key,
                "business_name": t.business_name,
                "action":        t.action,
                "amount":        t.amount,
                "balance_after": t.balance_after,
                "reason":        t.reason,
                "reference_id":  t.reference_id,
                "created_at":    t.created_at.isoformat(),
            }
            for t in txs
        ],
        "total": total,
    }


@app.get("/admin/revenue", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_revenue(db: AsyncSession = Depends(get_db)):
    licenses  = (await db.execute(select(License))).scalars().all()
    pkg_prices = {k: v["price"] for k, v in PACKAGES.items()}

    breakdown = {}
    for pkg, info in PACKAGES.items():
        count = sum(1 for l in licenses if l.package == pkg)
        breakdown[pkg] = {"name": pkg.capitalize(), "price": info["price"],
                          "count": count, "total": count * info["price"]}
    total_revenue = sum(b["total"] for b in breakdown.values())

    monthly: dict = defaultdict(lambda: {"revenue": 0, "new_users": 0})
    for lic in licenses:
        month = lic.created_at.strftime("%Y-%m")
        monthly[month]["revenue"]   += pkg_prices.get(lic.package, 49000)
        monthly[month]["new_users"] += 1
    monthly_list = [{"month": k, **v} for k, v in sorted(monthly.items())]

    return {"total_revenue": total_revenue, "breakdown": breakdown, "monthly": monthly_list}


@app.post("/admin/licenses/issue", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def issue_license(req: IssueLicenseRequest, db: AsyncSession = Depends(get_db)):
    if req.package not in PACKAGES:
        raise HTTPException(status_code=400, detail=f"Package tidak valid: {req.package}")

    license_key = "umkm-" + secrets.token_urlsafe(24)
    expires_at  = datetime.utcnow() + timedelta(days=30 * req.months)
    pkg_info    = PACKAGES[req.package]
    now         = datetime.utcnow()
    initial_bal = pkg_info["tokens"] if pkg_info["tokens"] > 0 else 99999

    db.add(License(key=license_key, business_name=req.business_name, email=req.email,
                   package=req.package, expires_at=expires_at, created_at=now, disabled=False))
    db.add(TokenAccount(license_key=license_key, balance=initial_bal, package=req.package))
    await _log_tx(db, license_key, req.business_name, "issue_license", initial_bal, initial_bal,
                  reason=f"Paket {req.package} — {req.months} bulan")
    await db.commit()

    return {
        "license_key":   license_key,
        "business_name": req.business_name,
        "package":       req.package,
        "tokens":        pkg_info["tokens"],
        "expires_at":    expires_at.isoformat(),
        "message":       "License berhasil diterbitkan",
    }


@app.get("/admin/licenses", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def list_licenses(db: AsyncSession = Depends(get_db)):
    keys = (await db.execute(select(License.key))).scalars().all()
    return {"total": len(keys), "licenses": list(keys)}


@app.post("/token/topup", tags=["Token"], dependencies=[Depends(require_master_key)])
async def topup_token(req: TopupRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(License).where(License.key == req.license_key))
    lic = result.scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=404, detail="License key tidak ditemukan")

    result = await db.execute(
        select(TokenAccount).where(TokenAccount.license_key == req.license_key))
    acct = result.scalar_one_or_none()
    if not acct:
        acct = TokenAccount(license_key=req.license_key, balance=0, package=lic.package)
        db.add(acct)

    acct.balance += req.amount
    await _log_tx(db, req.license_key, lic.business_name, "topup",
                  req.amount, acct.balance, reference_id=req.payment_reference)
    await db.commit()

    return {"license_key": req.license_key, "added": req.amount,
            "new_balance": acct.balance, "payment_reference": req.payment_reference}
