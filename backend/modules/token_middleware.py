from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import TokenBalance, TokenLedger

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


async def mark_synced(db: AsyncSession, ledger_ids: list[int]) -> None:
    result = await db.execute(
        select(TokenLedger).where(TokenLedger.id.in_(ledger_ids))
    )
    for ledger in result.scalars().all():
        ledger.synced = True
    token = await _get_or_create_balance(db)
    token.last_synced = datetime.utcnow()
    await db.commit()
