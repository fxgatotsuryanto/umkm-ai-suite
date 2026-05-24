# ==============================================================
# setup-cloud.ps1
# Jalankan script ini dari folder umkm-ai-suite untuk membuat
# folder umkm-ai-cloud siap di-push ke GitHub.
#
# Usage:
#   cd C:\Users\USER\umkm-ai-suite
#   .\setup-cloud.ps1
# ==============================================================

$dest = "$PSScriptRoot\..\umkm-ai-cloud"

Write-Host "Membuat folder: $dest" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$dest\admin" | Out-Null

# ── .gitignore ────────────────────────────────────────────────
@'
*.db
*.sqlite3
.env
__pycache__/
*.py[cod]
*.pyo
venv/
.venv/
'@ | Set-Content "$dest\.gitignore" -Encoding UTF8

# ── requirements.txt ─────────────────────────────────────────
@'
fastapi==0.115.5
uvicorn[standard]==0.32.1
pydantic-settings==2.6.1
python-dotenv==1.0.1
'@ | Set-Content "$dest\requirements.txt" -Encoding UTF8

# ── Dockerfile ────────────────────────────────────────────────
@'
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
'@ | Set-Content "$dest\Dockerfile" -Encoding UTF8

# ── railway.toml ──────────────────────────────────────────────
@'
[build]
builder = "dockerfile"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/"
healthcheckTimeout = 300
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 10
'@ | Set-Content "$dest\railway.toml" -Encoding UTF8

# ── .env.example ──────────────────────────────────────────────
@'
# ============================================================
# UMKM AI Suite - Cloud Server Environment
# Salin file ini menjadi .env lalu isi nilainya
# ============================================================

# -- WAJIB DIISI ---------------------------------------------

# Password untuk login ke admin panel (/panel)
MASTER_API_KEY=ganti-dengan-password-admin-panjang-dan-aman

# Secret untuk JWT token (min 32 karakter, acak)
JWT_SECRET=ganti-dengan-random-string-min-32-karakter

# -- CORS: izinkan domain dashboard --------------------------
# Pisahkan dengan koma jika lebih dari satu
CORS_ORIGINS=https://panel.aimarketingstrategic.com,http://localhost:3000

# -- OPSIONAL: Database PostgreSQL (untuk production) --------
# Aktifkan jika ingin data persistent (Railway PostgreSQL addon)
# CLOUD_DB_URL=postgresql+asyncpg://user:password@host:5432/umkm_cloud

# -- OPSIONAL: Payment Gateway --------------------------------
# MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxx
# XENDIT_SECRET_KEY=xnd_development_xxxxx
'@ | Set-Content "$dest\.env.example" -Encoding UTF8

# ── README.md ─────────────────────────────────────────────────
@'
# UMKM AI Suite - Cloud Server

Server cloud untuk manajemen token, lisensi, dan admin dashboard.
Deploy ke Railway dalam 5 menit.

## Endpoints

| URL | Fungsi |
|-----|--------|
| `GET  /`                       | Health check |
| `GET  /panel`                  | Admin dashboard UI |
| `GET  /packages`               | Daftar paket |
| `POST /admin/licenses/issue`   | Terbitkan lisensi baru |
| `GET  /admin/overview`         | Statistik sistem |
| `GET  /admin/users`            | Daftar semua user |
| `PATCH /admin/users/{key}`     | Update tier / status user |
| `POST /admin/token/adjust`     | Tambah/kurangi token manual |
| `GET  /admin/transactions`     | Log semua transaksi |
| `GET  /admin/revenue`          | Analisis revenue |
| `POST /api/sync/transactions`  | Sinkronisasi dari backend lokal |
| `POST /token/topup`            | Topup token via admin |

Semua endpoint `/admin/*` membutuhkan header `x-api-key: MASTER_API_KEY`.

---

## Deploy ke Railway

### 1. Buat akun Railway
Daftar di [railway.app](https://railway.app) (free tier tersedia).

### 2. Deploy via GitHub

```
Railway -> New Project -> Deploy from GitHub -> pilih umkm-ai-cloud
```

### 3. Set Environment Variables di Railway

Di dashboard Railway -> project -> Variables, tambahkan:

```
MASTER_API_KEY=password-admin-kamu-yang-panjang
JWT_SECRET=random-string-min-32-karakter
CORS_ORIGINS=https://panel.aimarketingstrategic.com
```

### 4. Dapatkan URL Railway

Setelah deploy, Railway memberi URL seperti:
```
https://umkm-ai-cloud.up.railway.app
```

Gunakan URL ini sebagai `CLOUD_API_URL` di backend lokal (file `.env`):
```
CLOUD_API_URL=https://umkm-ai-cloud.up.railway.app
```

### 5. Akses Admin Panel

Buka browser ke:
```
https://umkm-ai-cloud.up.railway.app/panel
```
Login dengan `MASTER_API_KEY` yang sudah kamu set.

---

## Jalankan Lokal (Development)

```bash
git clone https://github.com/fxgatotsuryanto/umkm-ai-cloud.git
cd umkm-ai-cloud
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --port 9000 --reload
```

Buka: http://localhost:9000/panel
'@ | Set-Content "$dest\README.md" -Encoding UTF8

# ── main.py ───────────────────────────────────────────────────
@'
"""
UMKM AI Suite - Cloud Server
Token Master, License Management & Admin Dashboard

Deploy: Railway / Render / VPS
Docs:   GET /docs

Environment Variables:
  MASTER_API_KEY  - Password untuk admin panel (wajib di production)
  JWT_SECRET      - Secret JWT (wajib di production)
  CORS_ORIGINS    - Comma-separated allowed origins
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


class CloudSettings(BaseSettings):
    MASTER_API_KEY:      str = "dev-master-key-change-in-production"
    JWT_SECRET:          str = "dev-jwt-secret-change-in-production"
    CORS_ORIGINS:        str = "*"
    MIDTRANS_SERVER_KEY: str = ""
    XENDIT_SECRET_KEY:   str = ""

    class Config:
        env_file = ".env"
        extra    = "ignore"

cloud_settings = CloudSettings()

_licenses:         dict = {}
_token_accounts:   dict = {}
_all_transactions: list = []

PACKAGES = {
    "starter": {"tokens": 500,   "price": 49000},
    "growth":  {"tokens": 1500,  "price": 99000},
    "pro":     {"tokens": -1,    "price": 199000},
}

ADMIN_HTML = Path(__file__).parent / "admin" / "index.html"

app = FastAPI(
    title="UMKM AI Suite - Cloud Server",
    description="Token master, license management, dan billing",
    version="1.0.0",
)

_cors = cloud_settings.CORS_ORIGINS.split(",") if cloud_settings.CORS_ORIGINS != "*" else ["*"]
app.add_middleware(CORSMiddleware, allow_origins=_cors, allow_methods=["*"], allow_headers=["*"])


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


def _next_tx_id() -> int:
    return len(_all_transactions) + 1


def _log_tx(license_key, action, amount, balance_after, reason="", reference_id=""):
    tx = {
        "id":            _next_tx_id(),
        "license_key":   license_key,
        "business_name": _licenses.get(license_key, {}).get("business_name", "-"),
        "action":        action,
        "amount":        amount,
        "balance_after": balance_after,
        "reason":        reason,
        "reference_id":  reference_id,
        "created_at":    datetime.utcnow().isoformat(),
    }
    _all_transactions.append(tx)
    return tx


def _is_active(key):
    lic = _licenses.get(key, {})
    if lic.get("disabled"):
        return False
    if lic.get("expires_at"):
        return datetime.fromisoformat(lic["expires_at"]) > datetime.utcnow()
    return True


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
    return {"balance": account["balance"], "package": account["package"], "expires_at": license_data.get("expires_at")}


@app.post("/api/sync/transactions", tags=["Sync"])
async def sync_transactions(req: SyncTransactionsRequest):
    if req.api_key not in _licenses:
        raise HTTPException(status_code=401, detail="API key tidak valid")
    account = _token_accounts.get(req.api_key, {"balance": 0})
    debit_total = sum(abs(t["amount"]) for t in req.transactions if t.get("amount", 0) < 0)
    account["balance"] = max(0, account["balance"] - debit_total)
    _token_accounts[req.api_key] = account
    for t in req.transactions:
        _log_tx(req.api_key, t.get("action", "sync"), t.get("amount", 0),
                account["balance"], reference_id=t.get("reference_id", ""))
    return {"accepted": len(req.transactions), "new_balance": account["balance"], "message": "Sinkronisasi berhasil"}


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
    tokens_today = sum(abs(t["amount"]) for t in _all_transactions
        if t.get("created_at", "")[:10] == today_str and t["amount"] < 0
        and t["action"] not in ("manual_deduct",))
    pkg_prices = {k: v["price"] for k, v in PACKAGES.items()}
    revenue_month = sum(pkg_prices.get(_licenses[k].get("package", "starter"), 49000)
        for k, lic in _licenses.items() if lic.get("created_at", "")[:7] == month_str)
    daily_stats = []
    for i in range(6, -1, -1):
        d = (now - timedelta(days=i)).date()
        val = sum(abs(t["amount"]) for t in _all_transactions
            if t.get("created_at", "")[:10] == d.isoformat() and t["amount"] < 0)
        daily_stats.append({"label": f"{d.day}/{d.month:02d}", "value": val})
    return {"total_users": total_users, "active_users": active_users,
            "tokens_today": tokens_today, "revenue_month": revenue_month, "daily_stats": daily_stats}


@app.get("/admin/users", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def admin_users():
    users = []
    for key, lic in _licenses.items():
        account = _token_accounts.get(key, {"balance": 0, "package": "starter"})
        users.append({"key": key, "business_name": lic.get("business_name", "-"),
            "email": lic.get("email", "-"), "package": lic.get("package", "starter"),
            "balance": account.get("balance", 0), "active": _is_active(key),
            "expires_at": lic.get("expires_at"), "created_at": lic.get("created_at")})
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
    _log_tx(req.license_key, "manual_adjust", req.amount, account["balance"], reason=req.reason)
    return {"message": "Token disesuaikan", "old_balance": old_balance,
            "new_balance": account["balance"], "adjusted": req.amount}


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
        breakdown[pkg] = {"name": pkg.capitalize(), "price": info["price"],
                          "count": count, "total": count * info["price"]}
    total_revenue = sum(b["total"] for b in breakdown.values())
    monthly: dict = defaultdict(lambda: {"revenue": 0, "new_users": 0})
    for lic in _licenses.values():
        ca = lic.get("created_at", "")
        if ca:
            month = ca[:7]
            monthly[month]["revenue"]   += pkg_prices.get(lic.get("package", "starter"), 49000)
            monthly[month]["new_users"] += 1
    monthly_list = [{"month": k, **v} for k, v in sorted(monthly.items())]
    return {"total_revenue": total_revenue, "breakdown": breakdown, "monthly": monthly_list}


@app.post("/admin/licenses/issue", tags=["Admin"], dependencies=[Depends(require_master_key)])
async def issue_license(req: IssueLicenseRequest):
    if req.package not in PACKAGES:
        raise HTTPException(status_code=400, detail=f"Package tidak valid: {req.package}")
    license_key = "umkm-" + secrets.token_urlsafe(24)
    expires_at  = datetime.utcnow() + timedelta(days=30 * req.months)
    pkg_info    = PACKAGES[req.package]
    now_iso     = datetime.utcnow().isoformat()
    _licenses[license_key] = {"business_name": req.business_name, "email": req.email,
        "package": req.package, "expires_at": expires_at.isoformat(),
        "created_at": now_iso, "disabled": False}
    _token_accounts[license_key] = {
        "balance": pkg_info["tokens"] if pkg_info["tokens"] > 0 else 99999,
        "package": req.package}
    _log_tx(license_key, "issue_license",
            pkg_info["tokens"] if pkg_info["tokens"] > 0 else 99999,
            _token_accounts[license_key]["balance"],
            reason=f"Paket {req.package} - {req.months} bulan")
    return {"license_key": license_key, "business_name": req.business_name,
            "package": req.package, "tokens": pkg_info["tokens"],
            "expires_at": expires_at.isoformat(), "message": "License berhasil diterbitkan"}


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
    _log_tx(req.license_key, "topup", req.amount, account["balance"],
            reference_id=req.payment_reference)
    return {"license_key": req.license_key, "added": req.amount,
            "new_balance": account["balance"], "payment_reference": req.payment_reference}
'@ | Set-Content "$dest\main.py" -Encoding UTF8

# ── admin/index.html ──────────────────────────────────────────
Write-Host "Menyalin admin/index.html..." -ForegroundColor Yellow
Copy-Item "$PSScriptRoot\deploy\admin-cloud.html" "$dest\admin\index.html"

# ── Git init & push ───────────────────────────────────────────
Write-Host "`nMenginisialisasi git..." -ForegroundColor Cyan
Push-Location $dest

git init
git add .
git commit -m "Initial commit - UMKM AI Cloud Server"
git remote add origin https://github.com/fxgatotsuryanto/umkm-ai-cloud.git
git push -u origin main

Pop-Location
Write-Host "`nSelesai! Cek: https://github.com/fxgatotsuryanto/umkm-ai-cloud" -ForegroundColor Green
