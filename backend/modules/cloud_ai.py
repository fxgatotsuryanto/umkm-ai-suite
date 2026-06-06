"""
Proxy AI call ke cloud backend.
OpenAI API key HANYA ada di cloud — client tidak perlu menyimpannya.
"""
import logging

import httpx

from backend.config import settings

_log = logging.getLogger(__name__)

_CLOUD_AI_TIMEOUT = 60  # detik — model bisa lambat untuk respons panjang


class CloudAIError(Exception):
    """Dilempar saat cloud AI tidak bisa dipanggil atau error."""
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


async def call_cloud_ai(
    messages: list[dict],
    action: str,
    max_tokens: int = 500,
    temperature: float = 0.7,
) -> str:
    """Kirim request ke POST /ai/chat di cloud, kembalikan teks respons AI."""
    cloud_url = settings.CLOUD_API_URL.rstrip("/")
    cloud_key = settings.CLOUD_API_KEY

    if not cloud_key:
        raise CloudAIError("CLOUD_API_KEY belum diset", status_code=503)
    if not cloud_url or cloud_url == "https://your-cloud.railway.app":
        raise CloudAIError("CLOUD_API_URL belum diset dengan benar", status_code=503)

    try:
        async with httpx.AsyncClient(timeout=_CLOUD_AI_TIMEOUT) as client:
            r = await client.post(
                f"{cloud_url}/ai/chat",
                headers={"x-api-key": cloud_key},
                json={
                    "messages": messages,
                    "action": action,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
    except httpx.TimeoutException:
        raise CloudAIError("Timeout saat menghubungi AI cloud (>60s)", status_code=504)
    except httpx.RequestError as exc:
        raise CloudAIError(f"Tidak dapat terhubung ke cloud: {exc}", status_code=502)

    if r.status_code == 402:
        raise CloudAIError("Saldo token tidak cukup", status_code=402)
    if r.status_code == 401:
        raise CloudAIError("License key tidak valid", status_code=401)
    if r.status_code == 503:
        raise CloudAIError("AI provider belum dikonfigurasi di server", status_code=503)
    if not r.is_success:
        detail = ""
        try:
            detail = r.json().get("detail", "")
        except Exception:
            pass
        raise CloudAIError(f"Cloud error {r.status_code}: {detail}", status_code=502)

    return r.json()["content"]
