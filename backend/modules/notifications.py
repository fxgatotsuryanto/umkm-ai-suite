import logging

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)


async def send_telegram(chat_id: str, text: str) -> bool:
    if not settings.TELEGRAM_BOT_TOKEN or not chat_id:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            )
        return resp.status_code == 200
    except Exception as e:
        logger.error("Telegram notification failed: %s", e)
        return False


async def send_webhook(url: str, payload: dict) -> bool:
    if not url:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(url, json=payload)
        return resp.status_code < 300
    except Exception as e:
        logger.error("Webhook notification failed: %s", e)
        return False
