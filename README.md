# UMKM AI Suite 🚀

Aplikasi AI untuk UMKM — WA Auto-Reply, Web Chat, & Konten Marketing otomatis.  
Arsitektur hybrid: data privat tersimpan lokal, token & billing di cloud.

---

## Struktur Project

```
umkm-ai-suite/
├── backend/                   ← FastAPI (jalan di server/VPS)
│   ├── main.py
│   ├── config.py
│   ├── db/models.py           ← SQLite lokal
│   ├── modules/
│   │   ├── wa_reply.py        ← WA Auto-Reply AI
│   │   ├── content_ai.py      ← Konten Marketing AI
│   │   ├── webchat.py         ← Web Chat AI
│   │   └── notifications.py  ← Telegram / Webhook notif
│   └── api/routes.py
│
├── dashboard/                 ← UI panel (Next.js 14)
├── webchat-widget/
│   └── widget.html            ← Widget embed untuk website client
├── n8n-workflows/
│   ├── wa-autoreply.json      ← Import ke n8n
│   └── webchat.json           ← Web Chat workflow n8n
└── deploy/
    ├── setup.sh               ← One-command VPS setup
    ├── nginx.conf             ← Nginx reverse proxy
    ├── backend.service        ← Systemd: backend FastAPI
    └── dashboard.service      ← Systemd: dashboard Next.js
```

---

## Cara Akses Dashboard

Ada **dua cara** menjalankan dashboard:

### Opsi A — Lokal (Development / Testing)

Jalankan dua terminal:

**Terminal 1 — Backend:**
```bash
cd umkm-ai-suite
cp .env.example .env          # isi OPENAI_API_KEY dll
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

**Terminal 2 — Dashboard:**
```bash
cd umkm-ai-suite/dashboard
npm install
npm run dev
```

**Buka browser:** `http://localhost:3000`

> API backend otomatis terhubung ke `http://localhost:8000` (default).

---

### Opsi B — Railway (Recommended untuk deployment cepat)

Deploy backend + dashboard ke Railway **tanpa VPS**. Setiap client UMKM punya dua Railway service dari satu repo.

```
https://umkm-backend-xxx.up.railway.app   ← FastAPI (backend)
https://umkm-dashboard-xxx.up.railway.app ← Next.js (dashboard)
```

#### Langkah-langkah Deploy

**Step 1 — Buat project Railway baru**

1. Buka [railway.app](https://railway.app) → **New Project**
2. Pilih **Deploy from GitHub repo** → pilih `fxgatotsuryanto/umkm-ai-suite`

---

**Step 2 — Deploy Backend (FastAPI)**

Railway otomatis mendeteksi `railway.toml` di root dan menjalankan `uvicorn`.

Di tab **Variables** service backend, isi:

```
OPENAI_API_KEY      = sk-or-v1-...          (dari openrouter.ai)
OPENAI_BASE_URL     = https://openrouter.ai/api/v1
OPENAI_MODEL        = openai/gpt-4o-mini
BUSINESS_NAME       = Nama Toko Client
N8N_WEBHOOK_SECRET  = secret-acak-panjang
SECRET_KEY          = secret-acak-panjang
CORS_ORIGINS        = https://umkm-dashboard-xxx.up.railway.app
TELEGRAM_BOT_TOKEN  = (opsional, untuk notif lead)
DATABASE_URL        = sqlite+aiosqlite:////data/umkm_local.db
```

> **Persistent data**: Di tab **Settings** → **Add Volume**, mount ke `/data`.  
> Tanpa volume, database reset saat redeploy.

Setelah deploy, catat URL backend, contoh:  
`https://umkm-backend-xxx.up.railway.app`

---

**Step 3 — Deploy Dashboard (Next.js)**

1. Di project yang sama, klik **+ New Service** → **GitHub Repo** (repo yang sama)
2. Di **Settings** service baru ini, ubah **Root Directory** → `dashboard`
3. Di tab **Variables**, isi:

```
NEXT_PUBLIC_BACKEND_URL = https://umkm-backend-xxx.up.railway.app
```

> ⚠️ `NEXT_PUBLIC_BACKEND_URL` harus diisi **sebelum** pertama kali deploy/build.  
> Setelah ubah nilai ini, wajib trigger redeploy manual.

Railway akan otomatis menjalankan `npm run build:railway` (dari `dashboard/railway.toml`).

---

**Step 4 — Update CORS Backend**

Setelah dashboard ter-deploy dan dapat URL-nya (contoh `https://umkm-dashboard-yyy.up.railway.app`):

1. Buka Variables service **backend**
2. Update: `CORS_ORIGINS = https://umkm-dashboard-yyy.up.railway.app`
3. Redeploy backend

---

**Step 5 — Test**

Buka URL dashboard di browser → Login → Cek semua fitur.

API docs tersedia di: `https://umkm-backend-xxx.up.railway.app/docs`

---

#### Replikasi per Client

Untuk setiap client UMKM baru, **fork project** Railway atau buat project baru yang clone repo yang sama, lalu isi variabel berbeda (terutama `OPENAI_API_KEY`, `BUSINESS_NAME`, `CORS_ORIGINS`).

---

### Opsi C — VPS / Server Produksi

Arsitektur produksi: **satu domain**, nginx sebagai reverse proxy:

```
https://panel.aimarketingstrategic.com
        │
        ├── /api/*  → FastAPI (port 8000)
        └── /*      → Next.js Dashboard (port 3000)
```

#### Setup otomatis (Ubuntu 22.04):

```bash
# Di VPS sebagai root:
bash <(curl -fsSL https://raw.githubusercontent.com/fxgatotsuryanto/umkm-ai-suite/main/deploy/setup.sh)
```

Script akan:
1. Install Node.js 20, Python 3, Nginx, Certbot
2. Clone repo ke `/opt/umkm-ai-suite`
3. Build Next.js dengan `NEXT_PUBLIC_BACKEND_URL` yang benar
4. Install 3 systemd services (backend + dashboard + cloud)
5. Konfigurasi Nginx + SSL otomatis via Certbot

#### Setup manual (jika perlu):

```bash
# 1. Clone
git clone https://github.com/fxgatotsuryanto/umkm-ai-suite.git /opt/umkm-ai-suite
cd /opt/umkm-ai-suite

# 2. Buat .env
cp .env.example .env
nano .env   # isi semua variabel

# 3. Python
python3 -m venv venv
venv/bin/pip install -r backend/requirements.txt

# 4. Build Next.js (penting: set URL backend dulu)
cd dashboard
NEXT_PUBLIC_BACKEND_URL=https://panel.aimarketingstrategic.com npm run build
cp -r .next/static .next/standalone/.next/static
cd ..

# 5. Systemd services
cp deploy/backend.service  /etc/systemd/system/umkm-backend.service
# Edit dashboard.service: ganti NEXT_PUBLIC_BACKEND_URL dengan domain kamu
cp deploy/dashboard.service /etc/systemd/system/umkm-dashboard.service

systemctl daemon-reload
systemctl enable  --now umkm-backend umkm-dashboard

# 6. Nginx
cp deploy/nginx.conf /etc/nginx/sites-available/panel.aimarketingstrategic.com
ln -s /etc/nginx/sites-available/panel.aimarketingstrategic.com \
      /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 7. SSL
certbot --nginx -d panel.aimarketingstrategic.com
```

**Buka browser:** `https://panel.aimarketingstrategic.com`

---

## Variabel Environment Wajib (.env)

```env
# OpenRouter (https://openrouter.ai)
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openai/gpt-4o-mini

# Cloud Server (token & billing)
CLOUD_API_URL=https://umkm-ai-cloud.up.railway.app
CLOUD_API_KEY=your-license-key

# Security
N8N_WEBHOOK_SECRET=random-secret
SECRET_KEY=random-secret

# Notifikasi lead via Telegram (opsional)
TELEGRAM_BOT_TOKEN=123456:ABCxxx
```

---

## Mengelola Dashboard di VPS

```bash
# Cek status semua service
systemctl status umkm-backend umkm-dashboard

# Restart setelah update
cd /opt/umkm-ai-suite && git pull
cd dashboard && NEXT_PUBLIC_BACKEND_URL=https://panel.aimarketingstrategic.com npm run build
cp -r .next/static .next/standalone/.next/static
systemctl restart umkm-backend umkm-dashboard

# Lihat log
journalctl -u umkm-backend  -f
journalctl -u umkm-dashboard -f
```

---

## API Endpoints (Backend)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/wa/reply` | Balas pesan WA (dari n8n) |
| GET | `/api/wa/chats` | Riwayat chat WA |
| POST | `/api/content/generate` | Generate konten AI |
| GET | `/api/content/library` | Library konten |
| POST | `/api/webchat/message` | Chat via web widget |
| GET | `/api/webchat/leads` | Daftar leads web chat |
| GET/PUT | `/api/webchat/config` | Konfigurasi widget |
| GET | `/api/webchat/leads/export` | Export CSV leads |
| GET | `/api/stats` | Stats terpadu dashboard |
| GET | `/api/token/balance` | Saldo token |
| GET/PUT | `/api/profile` | Profil bisnis |
| GET/POST | `/api/products` | Produk |
| GET/POST | `/api/faqs` | FAQ |
| **GET** | **/docs** | Swagger UI (semua endpoint) |

---

## Memasang Web Chat di Website Client

Setelah dashboard berjalan, buka **Web Chat → Konfigurasi Widget** untuk mendapatkan embed code.

**Metode 1 — Backend Widget (JS snippet):**
```html
<!-- Tempel sebelum </body> di website client -->
<!-- Copy kode lengkap dari webchat-widget/widget.html -->
<script>
  var BACKEND_URL = "https://panel.aimarketingstrategic.com";
  var THEME_COLOR = "#16a34a";
  var AGENT_NAME  = "AI Assistant";
</script>
```

**Metode 2 — n8n iframe:**
```html
<iframe src="https://n8n.anda.com/webhook/WEBHOOK_ID/chat"
  style="width:100%; height:600px; border:none; border-radius:12px;"
></iframe>
```

---

## Token System

| Aksi | Token |
|------|-------|
| WA Auto-Reply | 2 token |
| Web Chat (per pesan) | 2 token |
| Generate konten | 5 token |

---

## Tech Stack

- **Backend:** FastAPI + SQLAlchemy + SQLite
- **Dashboard:** Next.js 14 + Tailwind CSS
- **AI:** OpenRouter (GPT-4o-mini / model lain)
- **Workflow:** n8n
- **Deploy:** Nginx + Systemd + Certbot (VPS Ubuntu)
- **Cloud billing:** Railway — repo terpisah [`umkm-ai-cloud`](https://github.com/fxgatotsuryanto/umkm-ai-cloud)

---

Made with ❤️ for UMKM Indonesia
