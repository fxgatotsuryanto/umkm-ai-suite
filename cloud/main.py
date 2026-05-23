"""
Cloud Server — Token Master, License & Billing
Deploy ke: Railway / Render / VPS

Environment Variables Wajib:
  CLOUD_DB_URL       — PostgreSQL connection string
  MASTER_API_KEY     — Kunci admin (jaga kerahasiannya!)
  JWT_SECRET         — Secret untuk JWT token
"""

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings


class CloudSettings(BaseSettings):
    CLOUD_DB_URL: str = "sqlite+aiosqlite:///./cloud_dev.db"  # fallback dev
    MASTER_API_KEY: str = "dev-master-key-change-in-production"
    JWT_SECRET: str = "dev-jwt-secret-change-in-production"
    MIDTRANS_SERVER_KEY: str = ""
    XENDIT_SECRET_KEY: str = ""

    class Config:
        env_file = ".env"


cloud_settings = CloudSettings()

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

# In-memory store untuk development (ganti dengan DB di production)
_licenses: dict = {}
_token_accounts: dict = {}

PACKAGES = {
    "starter": {"tokens": 500, "price": 49000},
    "growth": {"tokens": 1500, "price": 99000},
    "pro": {"tokens": -1, "price": 199000},  # -1 = unlimited
}


# ── Auth ──────────────────────────────────────────────────────────────────────

def require_master_key(x_api_key: str = Header(...)):
    if x_api_key != cloud_settings.MASTER_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid master API key")


def require_license_key(x_api_key: str = Header(...)):
    if x_api_key not in _licenses:
        raise HTTPException(status_code=401, detail="License key tidak valid atau expired")
    license_data = _licenses[x_api_key]
    if license_data.get("expires_at") and datetime.fromisoformat(license_data["expires_at"]) < datetime.utcnow():
        raise HTTPException(status_code=401, detail="License expired")
    return license_data


# ── Schemas ───────────────────────────────────────────────────────────────────

class IssueLicenseRequest(BaseModel):
    business_name: str
    email: str
    package: str  # starter | growth | pro
    months: int = 1


class SyncTransactionsRequest(BaseModel):
    api_key: str
    transactions: list[dict]


class TopupRequest(BaseModel):
    license_key: str
    amount: int
    payment_reference: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/", tags=["health"])
async def root():
    return {"service": "UMKM AI Suite Cloud", "status": "running"}


@app.post("/admin/licenses/issue", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def issue_license(req: IssueLicenseRequest):
    if req.package not in PACKAGES:
        raise HTTPException(status_code=400, detail=f"Package tidak valid: {req.package}")

    license_key = "umkm-" + secrets.token_urlsafe(24)
    expires_at = datetime.utcnow() + timedelta(days=30 * req.months)
    package_info = PACKAGES[req.package]

    _licenses[license_key] = {
        "business_name": req.business_name,
        "email": req.email,
        "package": req.package,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.utcnow().isoformat(),
    }

    _token_accounts[license_key] = {
        "balance": package_info["tokens"],
        "package": req.package,
        "transactions": [],
    }

    return {
        "license_key": license_key,
        "business_name": req.business_name,
        "package": req.package,
        "tokens": package_info["tokens"],
        "expires_at": expires_at.isoformat(),
        "message": "License berhasil diterbitkan",
    }


@app.get("/admin/licenses", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def list_licenses():
    return {"total": len(_licenses), "licenses": list(_licenses.keys())}


@app.get("/license/validate", tags=["License"])
async def validate_license(license_data: dict = Depends(require_license_key)):
    return {"valid": True, **license_data}


@app.get("/token/balance", tags=["Token"])
async def cloud_token_balance(license_data: dict = Depends(require_license_key)):
    key = license_data.get("_key", "")
    account = _token_accounts.get(key, {"balance": 0, "package": "starter"})
    return {
        "balance": account["balance"],
        "package": account["package"],
        "expires_at": license_data.get("expires_at"),
    }


@app.post("/api/sync/transactions", tags=["Sync"])
async def sync_transactions(req: SyncTransactionsRequest):
    if req.api_key not in _licenses:
        raise HTTPException(status_code=401, detail="API key tidak valid")

    account = _token_accounts.get(req.api_key, {"balance": 0, "transactions": []})
    debit_total = sum(
        abs(t["amount"]) for t in req.transactions if t.get("amount", 0) < 0
    )
    account["balance"] = max(0, account["balance"] - debit_total)
    account["transactions"].extend(req.transactions)
    _token_accounts[req.api_key] = account

    return {
        "accepted": len(req.transactions),
        "new_balance": account["balance"],
        "message": "Sinkronisasi berhasil",
    }


@app.post("/token/topup", tags=["Token"], dependencies=[Depends(require_master_key)])
async def topup_token(req: TopupRequest):
    if req.license_key not in _licenses:
        raise HTTPException(status_code=404, detail="License key tidak ditemukan")

    account = _token_accounts.get(req.license_key, {"balance": 0, "transactions": []})
    account["balance"] += req.amount
    _token_accounts[req.license_key] = account

    return {
        "license_key": req.license_key,
        "added": req.amount,
        "new_balance": account["balance"],
        "payment_reference": req.payment_reference,
    }


@app.get("/packages", tags=["Billing"])
async def list_packages():
    return {"packages": PACKAGES}
