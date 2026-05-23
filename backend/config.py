from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "UMKM AI Suite"
    DEBUG: bool = False

    DATABASE_URL: str = "sqlite+aiosqlite:///./umkm_local.db"

    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENAI_MODEL: str = "openai/gpt-4o-mini"

    CLOUD_API_URL: str = "https://your-cloud.railway.app"
    CLOUD_API_KEY: str = ""

    CORS_ORIGINS: str = ""  # comma-separated, e.g. "http://localhost:3000,https://app.example.com" — empty = allow all

    N8N_WEBHOOK_SECRET: str = ""
    SECRET_KEY: str = "change-me-in-production"

    BUSINESS_NAME: str = "UMKM Saya"
    BUSINESS_TYPE: str = "retail"

    class Config:
        env_file = ".env"


settings = Settings()
