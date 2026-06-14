from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "UMKM AI Suite"
    DEBUG: bool = False

    DATABASE_URL: str = "sqlite+aiosqlite:///./umkm_local.db"

    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENAI_MODEL: str = "openai/gpt-4o-mini"

    # Cloud backend untuk validasi lisensi & sinkronisasi token
    CLOUD_API_URL: str = "https://umkm-backend.aimarketingstrategic.com"
    CLOUD_API_KEY: str = ""

    CORS_ORIGINS: str = ""  # comma-separated, e.g. "http://localhost:3000,https://app.example.com" — empty = allow all

    N8N_WEBHOOK_SECRET: str = ""
    SECRET_KEY: str = "change-me-in-production"

    BUSINESS_NAME: str = "UMKM Saya"
    BUSINESS_TYPE: str = "retail"

    TELEGRAM_BOT_TOKEN: str = ""  # untuk notifikasi lead webchat

    # Token awal saat startup (berguna jika CLOUD_API_KEY belum dikonfigurasi)
    # Set ke 0 untuk menonaktifkan, atau angka positif untuk memberikan token awal
    INITIAL_TOKEN_BALANCE: int = 0

    # Admin key untuk endpoint admin (default sama dengan SECRET_KEY jika kosong)
    ADMIN_API_KEY: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
