# Railway Deployment — aimarketingstrategic Backend

## ✅ Selesai

- [x] Update `railway.toml` — startCommand, healthcheckTimeout=300, restartPolicy
- [x] Update `dashboard/railway.toml` — healthcheckTimeout=300, restartPolicy
- [x] Pastikan `Procfile` konsisten dengan konfigurasi Railway
- [x] Update `README.md` — dokumentasi Railway deploy
- [x] Commit & push ke GitHub (commit: d653097)
- [x] Verifikasi backend Railway berjalan ✅
  - URL: https://umkm-ai-suite-production.up.railway.app
  - Response: `{"app":"UMKM AI Suite","version":"1.0.0","status":"running","backend":"aimarketingstrategic"}`
- [x] **Testing semua endpoint backend** — SEMUA LULUS ✅
  - GET /                    → 200 ✅
  - GET /docs                → 200 ✅
  - GET /api/stats           → 200 ✅
  - GET /api/token/balance   → 200 (balance=0, perlu CLOUD_API_KEY) ✅
  - GET /api/profile         → 200 (belum diatur) ✅
  - GET /api/wa/chats        → 200 [] ✅
  - GET /api/content/library → 200 [] ✅
  - GET /api/webchat/leads   → 200 [] ✅
  - GET /api/webchat/config  → 200 ✅
  - GET /api/products        → 200 [] ✅
  - GET /api/faqs            → 200 [] ✅
  - POST /api/webchat/message → 200 (gagal: token=0) ✅ endpoint OK
  - POST /api/content/generate → 200 (gagal: token=0) ✅ endpoint OK
  - OPTIONS CORS             → 200, allow-origin dashboard ✅
- [x] Verifikasi dashboard Railway berjalan ✅
  - URL: https://mindful-vibrancy-production-8f56.up.railway.app
  - Response: 200 HTML Next.js ✅
- [x] Tambah `INITIAL_TOKEN_BALANCE` di `backend/config.py`
- [x] Tambah `ADMIN_API_KEY` di `backend/config.py`
- [x] Tambah admin endpoints di `backend/api/routes.py`:
  - POST /api/admin/token/add       — tambah token lokal
  - GET  /api/admin/status          — cek status konfigurasi
  - POST /api/admin/token/set-package — set paket & expiry
- [x] Tambah `_startup_initial_token()` di `backend/main.py`
- [x] Tambah `"backend":"aimarketingstrategic"` di root response
- [x] Buat `.env.railway.example` — panduan environment variables Railway

---

## ⏳ Perlu Dilakukan (Manual di Railway Dashboard)

### 1. Set Environment Variables — Backend Service

Buka: Railway → Project → Backend Service → Variables

| Variable | Nilai | Keterangan |
|---|---|---|
| `OPENAI_API_KEY` | `sk-or-v1-xxx...` | **WAJIB** — dari openrouter.ai |
| `SECRET_KEY` | random 64 char | **WAJIB** — untuk keamanan |
| `INITIAL_TOKEN_BALANCE` | `500` | Token awal sebelum cloud sync |
| `BUSINESS_NAME` | `AI Marketing Strategic` | Nama bisnis |
| `BUSINESS_TYPE` | `marketing` | Tipe bisnis |
| `CORS_ORIGINS` | `https://mindful-vibrancy-production-8f56.up.railway.app` | URL dashboard |
| `CLOUD_API_URL` | *(opsional)* | URL cloud license server |
| `CLOUD_API_KEY` | *(opsional)* | License key dari cloud |
| `ADMIN_API_KEY` | *(opsional)* | Key untuk endpoint admin |

### 2. Set Environment Variables — Dashboard Service

Buka: Railway → Project → Dashboard Service → Variables

| Variable | Nilai |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `https://umkm-ai-suite-production.up.railway.app` |

### 3. Setelah Deploy Ulang — Test Token

Setelah `OPENAI_API_KEY` dan `INITIAL_TOKEN_BALANCE=500` di-set:

```powershell
# Cek balance (harus 500)
Invoke-WebRequest -Uri "https://umkm-ai-suite-production.up.railway.app/api/token/balance" -UseBasicParsing | Select-Object -ExpandProperty Content

# Test generate konten
Invoke-WebRequest -Uri "https://umkm-ai-suite-production.up.railway.app/api/content/generate" `
  -Method POST -ContentType "application/json" `
  -Body '{"platform":"instagram","content_type":"promo","topic":"Produk marketing terbaru"}' `
  -UseBasicParsing | Select-Object -ExpandProperty Content

# Test webchat AI
Invoke-WebRequest -Uri "https://umkm-ai-suite-production.up.railway.app/api/webchat/message" `
  -Method POST -ContentType "application/json" `
  -Body '{"session_id":"test-001","message":"Halo, apa layanan yang tersedia?"}' `
  -UseBasicParsing | Select-Object -ExpandProperty Content
```

### 4. Test Admin Endpoints (setelah SECRET_KEY di-set)

```powershell
# Cek status konfigurasi
Invoke-WebRequest -Uri "https://umkm-ai-suite-production.up.railway.app/api/admin/status" `
  -Headers @{"X-Admin-Key"="<SECRET_KEY_ANDA>"} `
  -UseBasicParsing | Select-Object -ExpandProperty Content

# Tambah token manual (jika perlu)
Invoke-WebRequest -Uri "https://umkm-ai-suite-production.up.railway.app/api/admin/token/add" `
  -Method POST -ContentType "application/json" `
  -Headers @{"X-Admin-Key"="<SECRET_KEY_ANDA>"} `
  -Body '{"amount":1000,"reason":"manual_topup"}' `
  -UseBasicParsing | Select-Object -ExpandProperty Content
```

---

## 📋 Ringkasan Arsitektur

```
GitHub (fxgatotsuryanto/umkm-ai-suite)
    │
    ├── Railway Backend Service
    │   URL: https://umkm-ai-suite-production.up.railway.app
    │   Config: railway.toml (root)
    │   Start: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
    │
    └── Railway Dashboard Service
        URL: https://mindful-vibrancy-production-8f56.up.railway.app
        Config: dashboard/railway.toml
        Start: HOSTNAME=0.0.0.0 node .next/standalone/server.js
        Env: NEXT_PUBLIC_BACKEND_URL → Backend URL
