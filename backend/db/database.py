from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool, AsyncAdaptedQueuePool

from backend.config import settings

# Normalise DATABASE_URL — Railway mungkin kasih format tanpa driver async
_db_url = settings.DATABASE_URL
if _db_url.startswith("mysql://"):
    _db_url = _db_url.replace("mysql://", "mysql+aiomysql://", 1)
elif _db_url.startswith("mariadb://"):
    _db_url = _db_url.replace("mariadb://", "mysql+aiomysql://", 1)
elif _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql+asyncpg://", 1)

_is_sqlite = _db_url.startswith("sqlite")
_engine_kwargs: dict = {"echo": settings.DEBUG}
if _is_sqlite:
    _engine_kwargs["poolclass"] = NullPool
else:
    _engine_kwargs["poolclass"] = AsyncAdaptedQueuePool
    _engine_kwargs["pool_size"] = 5
    _engine_kwargs["max_overflow"] = 10
    _engine_kwargs["pool_recycle"] = 1800
    _engine_kwargs["pool_pre_ping"] = True

engine = create_async_engine(_db_url, **_engine_kwargs)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    session = AsyncSessionLocal()
    try:
        yield session
    except Exception:
        try:
            await session.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            await session.close()
        except Exception:
            pass


async def init_db():
    from backend.db import models  # noqa: F401 — registers all models
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
