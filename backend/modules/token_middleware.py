import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import TokenBalance, TokenLedger

_log = logging.getLogger(__name__)

# Minimal interval antar sync ke cloud (hindari terlalu sering hit API)
_SYNC_INTERVAL = timedelta(minutes=5)

TOKEN_COSTS = {
    "wa_reply": 2,
    "content_generate": 5,
    "webchat": 2,
}


async def _get_or_create_balance(db: AsyncSession) -> TokenBalance:
    result = await db.execute(select(TokenBalance).where(TokenBalance.id == 1))
    token = result.scalar_one_or_none()
    if not token:
        token = TokenBalance(id=1, balance=0)
        db.add(token)
        await db.flush()
    return token


async def get_balance(db: AsyncSession) -> dict:
    token = await _get_or_create_balance(db)
    return {
        "balance": token.balance,
        "package": token.package,
        "expires_at": token.expires_at,
        "last_synced": token.last_synced,
    }


async def deduct_token(db: AsyncSession, action: str, reference_id: str = "") -> bool:
    cost = TOKEN_COSTS.get(action, 1)
    token = await _get_or_create_balance(db)

    if token.balance < cost:
        return False

    token.balance -= cost
    ledger = TokenLedger(
        action=action,
        amount=-cost,
        balance_after=token.balance,
        reference_id=reference_id,
        synced=False,
    )
    db.add(ledger)
    await db.flush()
    return True


async def add_token(
    db: AsyncSession, amount: int, action: str = "topup", reference_id: str = ""
) -> int:
    token = await _get_or_create_balance(db)
    token.balance += amount
    ledger = TokenLedger(
        action=action,
        amount=amount,
        balance_after=token.balance,
        reference_id=reference_id,
        synced=True,
    )
    db.add(ledger)
    await db.commit()
    await db.refresh(token)
    return token.balance


async def get_unsynced_transactions(db: AsyncSession) -> list:
    result = await db.execute(
        select(TokenLedger).where(TokenLedger.synced == False)  # noqa: E712
    )
    return result.scalars().all()


async def refund_token(db: AsyncSession, action: str, reference_id: str = "") -> int:
    cost = TOKEN_COSTS.get(action, 1)
    token = await _get_or_create_balance(db)
    token.balance += cost
    ledger = TokenLedger(
        action=f"{action}_refund",
        amount=cost,
        balance_after=token.balance,
        reference_id=reference_id,
        synced=True,
    )
    db.add(ledger)
    await db.commit()
    await db.refresh(token)
    return token.balance


async def sync_balance_from_cloud(db: AsyncSession, force: bool = False) -> Optional[dict]:
    """Ambil saldo token & info lisensi dari cloud server, update DB lokal.

    Hanya melakukan request ke cloud jika sudah melewati _SYNC_INTERVAL sejak
    sync terakhir, kecuali force=True.
    """
    from backend.config import settings  # import lazy agar tidak circular

    cloud_url = settings.CLOUD_API_URL.rstrip("/")
    cloud_key = settings.CLOUD_API_KEY
    if not cloud_key or not cloud_url or cloud_url == "https://your-cloud.railway.app":
        return None

    token = await _get_or_create_balance(db)
    if not force and token.last_synced:
        if datetime.utcnow() - token.last_synced < _SYNC_INTERVAL:
            return None  # masih segar, skip

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"{cloud_url}/token/balance",
                headers={"x-api-key": cloud_key},
            )
        if r.status_code != 200:
            _log.warning("Cloud balance sync gagal: HTTP %s", r.status_code)
            return None

        data = r.json()
        token.balance = data.get("balance", token.balance)
        token.package = data.get("package", token.package)
        raw_exp = data.get("expires_at")
        if raw_exp:
            token.expires_at = datetime.fromisoformat(raw_exp.replace("Z", "+00:00")).replace(tzinfo=None)
        token.last_synced = datetime.utcnow()
        await db.commit()
        _log.info("Token balance synced dari cloud: balance=%s package=%s", token.balance, token.package)
        return data
    except Exception as exc:
        _log.warning("Cloud balance sync error: %s", exc)
        return None


async def push_unsynced_to_cloud(db: AsyncSession) -> int:
    """Kirim transaksi lokal yang belum disync ke cloud. Return jumlah yang berhasil."""
    from backend.config import settings

    cloud_url = settings.CLOUD_API_URL.rstrip("/")
    cloud_key = settings.CLOUD_API_KEY
    if not cloud_key or not cloud_url or cloud_url == "https://your-cloud.railway.app":
        return 0

    unsynced = await get_unsynced_transactions(db)
    if not unsynced:
        return 0

    payload = [
        {
            "id": t.id,
            "action": t.action,
            "amount": t.amount,
            "balance_after": t.balance_after,
            "reference_id": t.reference_id,
            "created_at": t.created_at.isoformat(),
        }
        for t in unsynced
    ]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{cloud_url}/api/sync/transactions",
                json={"transactions": payload, "api_key": cloud_key},
            )
        if r.status_code == 200:
            await mark_synced(db, [t.id for t in unsynced])
            return len(unsynced)
        _log.warning("Push transactions gagal: HTTP %s", r.status_code)
        return 0
    except Exception as exc:
        _log.warning("Push transactions error: %s", exc)
        return 0


async def mark_synced(db: AsyncSession, ledger_ids: list[int]) -> None:
    result = await db.execute(
        select(TokenLedger).where(TokenLedger.id.in_(ledger_ids))
    )
    for ledger in result.scalars().all():
        ledger.synced = True
    token = await _get_or_create_balance(db)
    token.last_synced = datetime.utcnow()
    await db.commit()
