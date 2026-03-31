"""
Xendit disbursement service — GCash & PayPal withdrawals.

Sign up at https://dashboard.xendit.co and get your Secret Key from
Settings → API Keys. Set XENDIT_SECRET_KEY in .env to go live.

If XENDIT_SECRET_KEY is blank → SIMULATION MODE (no real money moved).
GCash  recipient_handle → PH mobile number e.g. "09171234567"
PayPal recipient_handle → email address
"""
import uuid
import httpx
from typing import Tuple
from app.core.config import get_settings

XENDIT_BASE = "https://api.xendit.co"


async def get_usdc_to_php_rate() -> float:
    """Live USDC → PHP rate from CoinGecko. Falls back to 56.0 on failure."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": "usd-coin", "vs_currencies": "php"},
            )
            resp.raise_for_status()
            return float(resp.json()["usd-coin"]["php"])
    except Exception:
        return 56.0  # fallback: ~1 USD ≈ 56 PHP


async def disburse_gcash(
    amount_php: float,
    phone_number: str,
    reference_id: str,
    description: str = "Bind earnings withdrawal",
) -> Tuple[bool, str, str]:
    """
    Send PHP to a GCash number via Xendit e-wallet disbursement.
    Returns: (success, external_id, error_message)
    """
    settings = get_settings()

    if not settings.XENDIT_SECRET_KEY:
        # Simulation mode — no real money moved
        return True, f"sim_{uuid.uuid4().hex[:16]}", ""

    payload = {
        "external_id":  reference_id,
        "amount":       int(amount_php),
        "phone_number": _normalize_ph_number(phone_number),
        "channel_code": "GCASH",
        "channel_properties": {
            "success_redirect_url": settings.FRONTEND_URL + "/withdraw/success",
            "failure_redirect_url": settings.FRONTEND_URL + "/withdraw/failed",
        },
        "description": description,
        "currency":    "PHP",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{XENDIT_BASE}/ewallets/charges",
                json=payload,
                auth=(settings.XENDIT_SECRET_KEY, ""),
            )
        if resp.status_code in (200, 201):
            data = resp.json()
            return True, data.get("id") or reference_id, ""
        error_data = resp.json()
        msg = error_data.get("message") or error_data.get("error_code") or str(resp.status_code)
        return False, "", f"Xendit GCash error: {msg}"
    except httpx.TimeoutException:
        return False, "", "Xendit request timed out. Please retry."
    except Exception as exc:
        return False, "", f"Unexpected error: {str(exc)}"


async def disburse_paypal(
    amount_php: float,
    email: str,
    reference_id: str,
    description: str = "Bind earnings withdrawal",
) -> Tuple[bool, str, str]:
    """
    PayPal disbursement via Xendit.

    NOTE: Xendit PH supports PayPal payouts on their Business tier.
    If your Xendit account does not have PayPal enabled, this falls
    back to PENDING (manual processing) and returns a queued reference.

    Returns: (success, external_id, error_message)
    """
    settings = get_settings()

    if not settings.XENDIT_SECRET_KEY:
        # Simulation mode
        return True, f"sim_pp_{uuid.uuid4().hex[:12]}", ""

    payload = {
        "external_id":  reference_id,
        "amount":       int(amount_php),
        "email":        email.strip().lower(),
        "channel_code": "PAYPAL",
        "channel_properties": {
            "success_redirect_url": settings.FRONTEND_URL + "/withdraw/success",
            "failure_redirect_url": settings.FRONTEND_URL + "/withdraw/failed",
        },
        "description": description,
        "currency":    "PHP",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{XENDIT_BASE}/ewallets/charges",
                json=payload,
                auth=(settings.XENDIT_SECRET_KEY, ""),
            )
        if resp.status_code in (200, 201):
            data = resp.json()
            return True, data.get("id") or reference_id, ""

        error_data = resp.json()
        error_code = error_data.get("error_code", "")

        # CHANNEL_NOT_ACTIVATED means PayPal not enabled on their Xendit account
        # Queue it as pending manual processing instead of hard-failing
        if "NOT_ACTIVATED" in error_code or "CHANNEL" in error_code:
            return True, f"pending_pp_{reference_id}", ""

        msg = error_data.get("message") or error_code or str(resp.status_code)
        return False, "", f"Xendit PayPal error: {msg}"
    except httpx.TimeoutException:
        return False, "", "Xendit request timed out. Please retry."
    except Exception as exc:
        return False, "", f"Unexpected error: {str(exc)}"


def _normalize_ph_number(phone: str) -> str:
    """Normalize to +63XXXXXXXXXX. Accepts 09XX, 9XX, +63XX."""
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("+63"):
        return phone
    if phone.startswith("09"):
        return "+63" + phone[1:]
    if phone.startswith("9") and len(phone) == 10:
        return "+63" + phone
    return phone
