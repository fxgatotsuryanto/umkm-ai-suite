#!/bin/bash
# ============================================================
# UMKM AI Suite — Server Setup Script
# Jalankan sebagai root di Ubuntu 22.04
# Usage: bash setup.sh
# ============================================================
set -e

DOMAIN="panel.aimarketingstrategic.com"
APP_DIR="/opt/umkm-ai-suite"
REPO_URL="https://github.com/fxgatotsuryanto/umkm-ai-suite.git"

echo "=== [1/8] Update sistem & install dependencies ==="
apt-get update -q
apt-get install -y -q \
    git curl wget nginx certbot python3-certbot-nginx \
    python3 python3-pip python3-venv \
    build-essential

# Install Node.js 20
echo "=== [2/8] Install Node.js 20 ==="
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "Node: $(node -v) | NPM: $(npm -v)"

# Clone repo
echo "=== [3/8] Clone / update repository ==="
if [ -d "$APP_DIR" ]; then
    echo "Direktori sudah ada, pull terbaru..."
    cd "$APP_DIR" && git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi
chown -R www-data:www-data "$APP_DIR"

# Python virtualenv
echo "=== [4/8] Setup Python virtual environment ==="
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --upgrade pip -q
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt" -q
echo "Python deps installed."

# Build Next.js
echo "=== [5/8] Build Next.js dashboard ==="
cd "$APP_DIR/dashboard"
npm install --silent
npm run build
cd "$APP_DIR"

# .env file
echo "=== [6/8] Cek .env file ==="
if [ ! -f "$APP_DIR/.env" ]; then
    echo ""
    echo "⚠️  File .env BELUM ADA!"
    echo "Buat file $APP_DIR/.env dengan isi:"
    cat <<'ENVEOF'
OPENAI_API_KEY=sk-or-v1-GANTI_DENGAN_KEY_OPENROUTER_KAMU
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openai/gpt-4o-mini
N8N_WEBHOOK_SECRET=ganti-dengan-secret-panjang-acak
SECRET_KEY=ganti-dengan-secret-panjang-acak
MASTER_API_KEY=ganti-dengan-password-admin-kamu
CLOUD_API_URL=http://127.0.0.1:9000
BUSINESS_NAME=Nama Toko Kamu
CORS_ORIGINS=https://panel.aimarketingstrategic.com
ENVEOF
    echo ""
    echo "Setelah buat .env, jalankan ulang script ini."
    exit 1
fi

# Systemd services
echo "=== [7/8] Install & aktifkan systemd services ==="
cp "$APP_DIR/deploy/backend.service" /etc/systemd/system/umkm-backend.service
cp "$APP_DIR/deploy/cloud.service"   /etc/systemd/system/umkm-cloud.service

# Buat service Next.js
cat > /etc/systemd/system/umkm-dashboard.service <<EOF
[Unit]
Description=UMKM AI Suite — Next.js Dashboard
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR/dashboard
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=NEXT_PUBLIC_BACKEND_URL=https://$DOMAIN
ExecStart=$(which node) $APP_DIR/dashboard/node_modules/.bin/next start --port 3000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable  umkm-backend umkm-cloud umkm-dashboard
systemctl restart umkm-backend umkm-cloud umkm-dashboard

echo "Services status:"
systemctl is-active umkm-backend  && echo "  ✅ backend  : running" || echo "  ❌ backend  : failed"
systemctl is-active umkm-cloud    && echo "  ✅ cloud    : running" || echo "  ❌ cloud    : failed"
systemctl is-active umkm-dashboard && echo "  ✅ dashboard: running" || echo "  ❌ dashboard: failed"

# Nginx
echo "=== [8/8] Konfigurasi Nginx & SSL ==="
cp "$APP_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/$DOMAIN"
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
echo "Nginx dikonfigurasi ✓"

echo ""
echo "Mendapatkan SSL certificate untuk $DOMAIN..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --email admin@aimarketingstrategic.com --redirect
systemctl reload nginx

echo ""
echo "══════════════════════════════════════════════"
echo " ✅ DEPLOYMENT SELESAI!"
echo " Dashboard : https://$DOMAIN"
echo " Admin     : https://$DOMAIN/panel"
echo " API Docs  : https://$DOMAIN/api/docs"
echo "══════════════════════════════════════════════"
