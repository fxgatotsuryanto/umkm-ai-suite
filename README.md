# UMKM AI Suite 🚀

Aplikasi AI untuk UMKM — WA Auto-Reply & Konten Marketing otomatis.  
Arsitektur hybrid: data privat tersimpan lokal, token & billing di cloud.

---

## Struktur Project

```
umkm-ai-suite/
├── backend/          ← Jalan di komputer/server UMKM
│   ├── main.py       ← Entry point FastAPI
│   ├── config.py     ← Settings dari .env
│   ├── db/models.py  ← Database lokal (SQLite)
│   ├── modules/
│   │   ├── wa_reply.py        ← Modul 1: WA Auto-Reply
│   │   ├── content_ai.py      ← Modul 4: Konten Marketing
│   │   └── token_middleware.py ← Token system
│   └── api/routes.py ← Semua endpoint API
│
├── dashboard/        ← UI web untuk UMKM (Next.js)
├── n8n-workflows/    ← Import ke n8n kamu
│   └── wa-autoreply.json
└── .env.example      ← Template config

> **Cloud server** (token, lisensi, billing, admin panel) ada di repo terpisah:
> 👉 https://github.com/fxgatotsuryanto/umkm-ai-cloud — deploy ke Railway.
```

---

## Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/kamu/umkm-ai-suite.git
cd umkm-ai-suite

cp .env.example .env
# Edit .env — isi OPENAI_API_KEY, dll
```

### 2. Install Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Mac/Linux
# atau: venv\Scripts\activate   # Windows

pip install -r requirements.txt
```

### 3. Jalankan Backend Lokal

```bash
# Dari root folder
uvicorn backend.main:app --reload --port 8000
```

Buka: http://localhost:8000/docs

### 4. Setup Cloud Server

Cloud server dikelola di repo terpisah. Deploy ke Railway:

```bash
git clone https://github.com/fxgatotsuryanto/umkm-ai-cloud.git
cd umkm-ai-cloud
# Ikuti README di repo tersebut untuk deploy ke Railway
```

Setelah deploy, salin URL Railway ke `.env` lokal:
```env
CLOUD_API_URL=https://umkm-ai-cloud.up.railway.app
```

### 5. Import n8n Workflow

1. Buka n8n kamu
2. Import `n8n-workflows/wa-autoreply.json`
3. Set environment variable `N8N_WEBHOOK_SECRET` dan `BACKEND_URL`
4. Aktifkan workflow & arahkan webhook WA ke URL n8n

### 6. Dashboard UI

```bash
cd dashboard
npm install
npm run dev
```

Buka: http://localhost:3000

---

## API Endpoints (Backend Lokal)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/wa/reply` | Terima & balas pesan WA (dari n8n) |
| GET | `/api/wa/chats` | List chat aktif |
| POST | `/api/content/generate` | Generate konten AI |
| GET | `/api/content/library` | Library konten |
| GET | `/api/token/balance` | Cek saldo token |
| POST | `/api/token/sync-offline` | Sync transaksi offline |
| GET | `/api/products` | List produk |
| POST | `/api/products` | Tambah produk |
| GET | `/api/faqs` | List FAQ |
| POST | `/api/faqs` | Tambah FAQ |
| GET/PUT | `/api/profile` | Profil bisnis |

---

## Token System

| Aksi | Token Digunakan |
|------|----------------|
| 1 WA Auto-Reply | 2 token |
| Generate konten (semua platform) | 5 token |
| Offline mode limit | 20 token |

---

## Paket Harga

| Paket | Token/bulan | Harga |
|-------|-------------|-------|
| Starter | 500 token | Rp 49.000/bulan |
| Growth | 1.500 token | Rp 99.000/bulan |
| Pro | Unlimited* | Rp 199.000/bulan |

---

## Tech Stack

- **Backend:** FastAPI + SQLAlchemy + SQLite (lokal)
- **Cloud:** FastAPI + PostgreSQL
- **AI:** OpenAI GPT-4o-mini
- **Workflow:** n8n
- **Dashboard:** Next.js 14
- **Payment:** Midtrans / Xendit
- **Deploy Cloud:** Railway / Render / VPS

---

## Roadmap

- [x] Modul 1: WA Auto-Reply AI
- [x] Modul 4: Konten Marketing AI
- [ ] Dashboard UI (Next.js) — in progress
- [ ] Modul 2: Invoice AI
- [ ] Modul 3: Manajemen Stok
- [ ] Modul 5: Analisis Penjualan
- [ ] Installer (PyInstaller)
- [ ] Mobile app

---

Made with ❤️ for UMKM Indonesia
