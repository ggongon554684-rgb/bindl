"""
Withdrawal endpoints — cash out USDC earnings to GCash or PayPal.

GET  /withdrawals/rate?amount_usdc=X  → live rate + PHP payout preview
POST /withdrawals/request             → submit withdrawal
GET  /withdrawals/{wallet}            → list withdrawals + balance
GET  /withdrawals/status/{id}         → single withdrawal status
"""
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, validator

from app.core.database import get_db
from app.core.config import get_settings
from app.models.models import (
    User, Reputation, Withdrawal,
    WithdrawalStatus, WithdrawalChannel,
)
from app.services.xendit import get_usdc_to_php_rate, disburse_gcash, disburse_paypal
from app.validators import validate_ethereum_address

router = APIRouter()

MIN_USDC = 1.0
MAX_USDC = 10_000.0


# ── Schemas ───────────────────────────────────────────────────────────────────

class WithdrawalRequest(BaseModel):
    wallet:           str
    amount_usdc:      float
    channel:          WithdrawalChannel
    recipient_handle: str  # GCash phone or PayPal email

    @validator("channel", pre=True)
    def validate_channel(cls, v):
        """Accept string channel values and normalize to enum"""
        if isinstance(v, str):
            v_lower = v.lower()
            if v_lower not in ["gcash", "paypal"]:
                raise ValueError(f"channel must be 'gcash' or 'paypal', got '{v}'")
            return v_lower
        return v

    @validator("amount_usdc")
    def check_amount(cls, v):
        if v < MIN_USDC:
            raise ValueError(f"Minimum withdrawal is {MIN_USDC} USDC")
        if v > MAX_USDC:
            raise ValueError(f"Maximum withdrawal is {MAX_USDC} USDC")
        return round(v, 2)

    @validator("recipient_handle")
    def check_handle(cls, v):
        if not v or not v.strip():
            raise ValueError("recipient_handle cannot be empty")
        return v.strip()


# ── Helpers ───────────────────────────────────────────────────────────────────

def fmt(w: Withdrawal) -> dict:
    return {
        "id":               str(w.id),
        "amount_usdc":      w.amount_usdc,
        "amount_php":       w.amount_php,
        "exchange_rate":    w.exchange_rate,
        "fee_usdc":         w.fee_usdc,
        "net_usdc":         round(w.amount_usdc - (w.fee_usdc or 0), 4),
        "channel":          w.channel.value,
        "recipient_handle": w.recipient_handle,
        "status":           w.status.value,
        "external_id":      w.external_id,
        "failure_reason":   w.failure_reason,
        "created_at":       w.created_at.isoformat(),
        "completed_at":     w.completed_at.isoformat() if w.completed_at else None,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/rate")
async def get_rate(amount_usdc: float = 10.0):
    """Return live USDC→PHP rate and PHP payout preview for a given USDC amount."""
    settings = get_settings()
    if amount_usdc < MIN_USDC:
        raise HTTPException(400, f"Minimum is {MIN_USDC} USDC")

    rate     = await get_usdc_to_php_rate()
    fee_usdc = round(amount_usdc * (settings.WITHDRAWAL_FEE_PCT / 100), 4)
    net_usdc = round(amount_usdc - fee_usdc, 4)
    php_out  = round(net_usdc * rate, 2)

    return {
        "usdc_to_php_rate":     rate,
        "requested_usdc":       amount_usdc,
        "fee_usdc":             fee_usdc,
        "fee_pct":              settings.WITHDRAWAL_FEE_PCT,
        "net_usdc_after_fee":   net_usdc,
        "estimated_php_payout": php_out,
        "simulation_mode":      not bool(settings.XENDIT_SECRET_KEY),
        "note": (
            "Simulation mode — no real money moved."
            if not settings.XENDIT_SECRET_KEY
            else "Live mode — funds sent to your payout channel."
        ),
    }


@router.post("/request", status_code=201)
async def request_withdrawal(data: WithdrawalRequest, db: Session = Depends(get_db)):
    """
    Submit a withdrawal request.
    Deducts balance optimistically. Refunds on failure.
    """
    settings = get_settings()

    is_valid, error = validate_ethereum_address(data.wallet)
    if not is_valid:
        raise HTTPException(400, f"Invalid wallet: {error}")

    user = db.query(User).filter(User.wallet_address == data.wallet.lower()).first()
    if not user:
        raise HTTPException(404, "Wallet not found. Complete a contract first.")

    rep = db.query(Reputation).filter(Reputation.user_id == user.id).first()
    if not rep:
        raise HTTPException(404, "No reputation record found.")

    available = rep.usdc_balance or 0.0
    if data.amount_usdc > available:
        raise HTTPException(400, (
            f"Insufficient balance. "
            f"Available: {available:.2f} USDC, requested: {data.amount_usdc:.2f} USDC."
        ))

    # Calculate fee + PHP equivalent
    rate     = await get_usdc_to_php_rate()
    fee_usdc = round(data.amount_usdc * (settings.WITHDRAWAL_FEE_PCT / 100), 4)
    net_usdc = round(data.amount_usdc - fee_usdc, 4)
    php_out  = round(net_usdc * rate, 2)

    # Deduct balance optimistically
    rep.usdc_balance = round(available - data.amount_usdc, 4)

    reference_id = f"bind_{uuid.uuid4().hex[:16]}"
    withdrawal = Withdrawal(
        user_id          = user.id,
        amount_usdc      = data.amount_usdc,
        amount_php       = php_out,
        exchange_rate    = rate,
        fee_usdc         = fee_usdc,
        channel          = data.channel,
        recipient_handle = data.recipient_handle,
        status           = WithdrawalStatus.PROCESSING,
        external_id      = reference_id,
    )
    db.add(withdrawal)
    db.flush()

    # Call the right disburse function
    if data.channel == WithdrawalChannel.GCASH:
        success, ext_id, err = await disburse_gcash(
            amount_php   = php_out,
            phone_number = data.recipient_handle,
            reference_id = reference_id,
            description  = f"Bind earnings — {net_usdc:.2f} USDC",
        )
    else:
        success, ext_id, err = await disburse_paypal(
            amount_php   = php_out,
            email        = data.recipient_handle,
            reference_id = reference_id,
            description  = f"Bind earnings — {net_usdc:.2f} USDC",
        )

    if success:
        withdrawal.external_id  = ext_id
        withdrawal.status       = WithdrawalStatus.COMPLETED
        withdrawal.completed_at = datetime.utcnow()
        # PayPal queued = still pending
        if ext_id.startswith("pending_pp_"):
            withdrawal.status       = WithdrawalStatus.PENDING
            withdrawal.completed_at = None
    else:
        # Refund on failure
        rep.usdc_balance      = round(rep.usdc_balance + data.amount_usdc, 4)
        withdrawal.status     = WithdrawalStatus.FAILED
        withdrawal.failure_reason = err

    db.commit()
    db.refresh(withdrawal)

    if not success:
        raise HTTPException(502, {
            "message":       "Withdrawal failed — your balance has been refunded.",
            "reason":        err,
            "withdrawal_id": str(withdrawal.id),
        })

    channel_label = "GCash" if data.channel == WithdrawalChannel.GCASH else "PayPal"
    return {
        "message": (
            f"Withdrawal submitted! Your {channel_label} will receive the funds shortly."
            if withdrawal.status == WithdrawalStatus.COMPLETED
            else f"Withdrawal queued for manual processing to {channel_label}."
        ),
        "withdrawal":        fmt(withdrawal),
        "remaining_balance": round(rep.usdc_balance, 4),
        "simulation_mode":   not bool(settings.XENDIT_SECRET_KEY),
    }


@router.get("/status/{withdrawal_id}")
def get_withdrawal_status(withdrawal_id: str, db: Session = Depends(get_db)):
    """Check a single withdrawal by ID."""
    w = db.query(Withdrawal).filter(Withdrawal.id == withdrawal_id).first()
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    return fmt(w)


@router.get("/{wallet_address}")
def get_withdrawals(wallet_address: str, db: Session = Depends(get_db)):
    """List all withdrawals for a wallet, newest first."""
    is_valid, error = validate_ethereum_address(wallet_address)
    if not is_valid:
        raise HTTPException(400, f"Invalid wallet: {error}")

    user = db.query(User).filter(User.wallet_address == wallet_address.lower()).first()
    if not user:
        return {"withdrawals": [], "usdc_balance": 0.0, "total_withdrawn_usdc": 0.0}

    rep = db.query(Reputation).filter(Reputation.user_id == user.id).first()
    withdrawals = (
        db.query(Withdrawal)
        .filter(Withdrawal.user_id == user.id)
        .order_by(Withdrawal.created_at.desc())
        .all()
    )
    total_withdrawn = sum(
        w.amount_usdc for w in withdrawals if w.status == WithdrawalStatus.COMPLETED
    )

    return {
        "wallet_address":       wallet_address.lower(),
        "usdc_balance":         round(rep.usdc_balance  or 0.0, 4) if rep else 0.0,
        "usdc_earned_total":    round(rep.usdc_earned   or 0.0, 4) if rep else 0.0,
        "total_withdrawn_usdc": round(total_withdrawn,       4),
        "withdrawals":          [fmt(w) for w in withdrawals],
    }