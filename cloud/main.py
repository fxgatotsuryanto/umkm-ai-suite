"""
Cloud Server — Token Master, License & Billing
Deploy ke: Railway / Render / VPS

Environment Variables Wajib:
  CLOUD_DB_URL       — PostgreSQL connection string
  MASTER_API_KEY     — Kunci admin (jaga kerahasiannya!)
  JWT_SECRET         — Secret untuk JWT token
"""

import secrets
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from pydantic_settings import BaseSettings

# ── Config ────────────────────────────────────────────────────────────────────

class CloudSettings(BaseSettings):
    CLOUD_DB_URL:    str = "sqlite+aiosqlite:///./cloud_dev.db"
    MASTER_API_KEY:  str = "dev-master-key-change-in-production"
    JWT_SECRET:      str = "dev-jwt-secret-change-in-production"
    MIDTRANS_SERVER_KEY: str = ""
    XENDIT_SECRET_KEY:   str = ""

    class Config:
        env_file = ".env"
        extra    = "ignore"

cloud_settings = CloudSettings()

# ── In-memory store (replace with DB in production) ──────────────────────────

_licenses:      dict = {}   # key → license metadata
_token_accounts: dict = {}  # key → {balance, package, ...}
_all_transactions: list = [] # append-only global log

PACKAGES = {
    "starter": {"tokens": 500,   "price": 49000},
    "growth":  {"tokens": 1500,  "price": 99000},
    "pro":     {"tokens": -1,    "price": 199000},  # -1 = unlimited
}

ADMIN_HTML = Path(__file__).parent / "admin" / "index.html"

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="UMKM AI Suite — Cloud Server",
    description="Token master, license management, dan billing",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth helpers ──────────────────────────────────────────────────────────────

def require_master_key(x_api_key: str = Header(...)):
    if x_api_key != cloud_settings.MASTER_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid master API key")


def require_license_key(x_api_key: str = Header(...)):
    if x_api_key not in _licenses:
        raise HTTPException(status_code=401, detail="License key tidak valid atau expired")
    lic = _licenses[x_api_key]
    if lic.get("expires_at") and datetime.fromisoformat(lic["expires_at"]) < datetime.utcnow():
        raise HTTPException(status_code=401, detail="License expired")
    return {"_key": x_api_key, **lic}

# ── Internal helpers ──────────────────────────────────────────────────────────

def _next_tx_id() -> int:
    return len(_all_transactions) + 1


def _log_tx(license_key: str, action: str, amount: int, balance_after: int,
            reason: str = "", reference_id: str = "") -> dict:
    tx = {
        "id":            _next_tx_id(),
        "license_key":   license_key,
        "business_name": _licenses.get(license_key, {}).get("business_name", "—"),
        "action":        action,
        "amount":        amount,
        "balance_after": balance_after,
        "reason":        reason,
        "reference_id":  reference_id,
        "created_at":    datetime.utcnow().isoformat(),
    }
    _all_transactions.append(tx)
    return tx


def _is_active(key: str) -> bool:
    lic = _licenses.get(key, {})
    if lic.get("disabled"):
        return False
    if lic.get("expires_at"):
        return datetime.fromisoformat(lic["expires_at"]) > datetime.utcnow()
    return True

# ── Schemas ───────────────────────────────────────────────────────────────────

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
async def validate_license(license_data: dict = Depends(require_license_key)):
    return {"valid": True, **{k: v for k, v in license_data.items() if k != "_key"}}


@app.get("/token/balance", tags=["Token"])
async def cloud_token_balance(license_data: dict = Depends(require_license_key)):
    key = license_data["_key"]
    account = _token_accounts.get(key, {"balance": 0, "package": "starter"})
    return {
        "balance":    account["balance"],
        "package":    account["package"],
        "expires_at": license_data.get("expires_at"),
    }


@app.post("/api/sync/transactions", tags=["Sync"])
async def sync_transactions(req: SyncTransactionsRequest):
    if req.api_key not in _licenses:
        raise HTTPException(status_code=401, detail="API key tidak valid")

    account = _token_accounts.get(req.api_key, {"balance": 0})
    debit_total = sum(abs(t["amount"]) for t in req.transactions if t.get("amount", 0) < 0)
    account["balance"] = max(0, account["balance"] - debit_total)
    _token_accounts[req.api_key] = account

    # Log each synced transaction
    for t in req.transactions:
        _log_tx(
            license_key=req.api_key,
            action=t.get("action", "sync"),
            amount=t.get("amount", 0),
            balance_after=account["balance"],
            reference_id=t.get("reference_id", ""),
        )

    return {
        "accepted":    len(req.transactions),
        "new_balance": account["balance"],
        "message":     "Sinkronisasi berhasil",
    }

# ══════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/panel", response_class=HTMLResponse, include_in_schema=False)
async def admin_panel():
    return HTMLResponse(ADMIN_HTML.read_text(encoding="utf-8"))


@app.get("/admin/overview", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_overview():
    now = datetime.utcnow()
    today_str = now.date().isoformat()
    month_str = now.strftime("%Y-%m")

    total_users  = len(_licenses)
    active_users = sum(1 for k in _licenses if _is_active(k))

    tokens_today = sum(
        abs(t["amount"]) for t in _all_transactions
        if t.get("created_at", "")[:10] == today_str and t["amount"] < 0
        and t["action"] not in ("manual_deduct",)
    )

    # Revenue this month = users whose created_at is in current month
    pkg_prices = {k: v["price"] for k, v in PACKAGES.items()}
    revenue_month = sum(
        pkg_prices.get(_licenses[k].get("package", "starter"), 49000)
        for k, lic in _licenses.items()
        if lic.get("created_at", "")[:7] == month_str
    )

    # Daily stats — last 7 days
    daily_stats = []
    for i in range(6, -1, -1):
        d = (now - timedelta(days=i)).date()
        val = sum(
            abs(t["amount"]) for t in _all_transactions
            if t.get("created_at", "")[:10] == d.isoformat() and t["amount"] < 0
        )
        daily_stats.append({"label": f"{d.day}/{d.month:02d}", "value": val})

    return {
        "total_users":   total_users,
        "active_users":  active_users,
        "tokens_today":  tokens_today,
        "revenue_month": revenue_month,
        "daily_stats":   daily_stats,
    }


@app.get("/admin/users", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_users():
    users = []
    for key, lic in _licenses.items():
        account = _token_accounts.get(key, {"balance": 0, "package": "starter"})
        users.append({
            "key":           key,
            "business_name": lic.get("business_name", "—"),
            "email":         lic.get("email", "—"),
            "package":       lic.get("package", "starter"),
            "balance":       account.get("balance", 0),
            "active":        _is_active(key),
            "expires_at":    lic.get("expires_at"),
            "created_at":    lic.get("created_at"),
        })
    return {"users": users, "total": len(users)}


@app.patch("/admin/users/{key}", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def update_user(key: str, req: UserUpdateRequest):
    if key not in _licenses:
        raise HTTPException(status_code=404, detail="License tidak ditemukan")
    if req.active is not None:
        _licenses[key]["disabled"] = not req.active
    if req.package is not None:
        if req.package not in PACKAGES:
            raise HTTPException(status_code=400, detail=f"Package tidak valid: {req.package}")
        _licenses[key]["package"] = req.package
        if key in _token_accounts:
            _token_accounts[key]["package"] = req.package
    return {"message": "User diperbarui", "key": key}


@app.post("/admin/token/adjust", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_token_adjust(req: TokenAdjustRequest):
    if req.license_key not in _licenses:
        raise HTTPException(status_code=404, detail="License tidak ditemukan")

    account = _token_accounts.get(req.license_key, {"balance": 0})
    old_balance = account["balance"]
    account["balance"] = max(0, old_balance + req.amount)
    _token_accounts[req.license_key] = account

    _log_tx(
        license_key=req.license_key,
        action="manual_adjust",
        amount=req.amount,
        balance_after=account["balance"],
        reason=req.reason,
    )

    return {
        "message":     "Token disesuaikan",
        "old_balance": old_balance,
        "new_balance": account["balance"],
        "adjusted":    req.amount,
    }


@app.get("/admin/transactions", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_transactions(limit: int = 100):
    txs = sorted(_all_transactions, key=lambda t: t.get("created_at", ""), reverse=True)
    return {"transactions": txs[:limit], "total": len(txs)}


@app.get("/admin/revenue", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_revenue():
    pkg_prices = {k: v["price"] for k, v in PACKAGES.items()}

    breakdown = {}
    for pkg, info in PACKAGES.items():
        count = sum(1 for lic in _licenses.values() if lic.get("package") == pkg)
        breakdown[pkg] = {
            "name":  pkg.capitalize(),
            "price": info["price"],
            "count": count,
            "total": count * info["price"],
        }
    total_revenue = sum(b["total"] for b in breakdown.values())

    # Group licenses by creation month
    monthly: dict = defaultdict(lambda: {"revenue": 0, "new_users": 0})
    for lic in _licenses.values():
        ca = lic.get("created_at", "")
        if ca:
            month = ca[:7]
            monthly[month]["revenue"]   += pkg_prices.get(lic.get("package", "starter"), 49000)
            monthly[month]["new_users"] += 1
    monthly_list = [{"month": k, **v} for k, v in sorted(monthly.items())]

    return {
        "total_revenue": total_revenue,
        "breakdown":     breakdown,
        "monthly":       monthly_list,
    }


@app.post("/admin/licenses/issue", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def issue_license(req: IssueLicenseRequest):
    if req.package not in PACKAGES:
        raise HTTPException(status_code=400, detail=f"Package tidak valid: {req.package}")

    license_key = "umkm-" + secrets.token_urlsafe(24)
    expires_at  = datetime.utcnow() + timedelta(days=30 * req.months)
    pkg_info    = PACKAGES[req.package]
    now_iso     = datetime.utcnow().isoformat()

    _licenses[license_key] = {
        "business_name": req.business_name,
        "email":         req.email,
        "package":       req.package,
        "expires_at":    expires_at.isoformat(),
        "created_at":    now_iso,
        "disabled":      False,
    }
    _token_accounts[license_key] = {
        "balance": pkg_info["tokens"] if pkg_info["tokens"] > 0 else 99999,
        "package": req.package,
    }

    _log_tx(
        license_key=license_key,
        action="issue_license",
        amount=pkg_info["tokens"] if pkg_info["tokens"] > 0 else 99999,
        balance_after=_token_accounts[license_key]["balance"],
        reason=f"Paket {req.package} — {req.months} bulan",
    )

    return {
        "license_key":   license_key,
        "business_name": req.business_name,
        "package":       req.package,
        "tokens":        pkg_info["tokens"],
        "expires_at":    expires_at.isoformat(),
        "message":       "License berhasil diterbitkan",
    }


@app.get("/admin/licenses", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def list_licenses():
    return {"total": len(_licenses), "licenses": list(_licenses.keys())}


@app.post("/token/topup", tags=["Token"], dependencies=[Depends(require_master_key)])
async def topup_token(req: TopupRequest):
    if req.license_key not in _licenses:
        raise HTTPException(status_code=404, detail="License key tidak ditemukan")

    account = _token_accounts.get(req.license_key, {"balance": 0})
    account["balance"] += req.amount
    _token_accounts[req.license_key] = account

    _log_tx(
        license_key=req.license_key,
        action="topup",
        amount=req.amount,
        balance_after=account["balance"],
        reference_id=req.payment_reference,
    )

    return {
        "license_key":     req.license_key,
        "added":           req.amount,
        "new_balance":     account["balance"],
        "payment_reference": req.payment_reference,
    }
