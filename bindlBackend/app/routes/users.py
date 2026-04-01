from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import User, Reputation
from app.validators import validate_ethereum_address

router = APIRouter()


@router.get("/{wallet_address}/reputation")
def get_reputation(wallet_address: str, db: Session = Depends(get_db)):
    # Validate wallet format
    is_valid, error = validate_ethereum_address(wallet_address)
    if not is_valid:
        raise HTTPException(400, f"Invalid wallet address: {error}")
    
    wallet_lower = wallet_address.lower()
    user = db.query(User).filter(User.wallet_address == wallet_lower).first()
    if not user:
        return {
            "address":             wallet_lower,   # ✅ alias frontend expects
            "wallet_address":      wallet_lower,
            "score":               0.0,
            "total_contracts":     0,
            "completed_contracts": 0,
            "disputes_raised":     0,
            "disputes_won":        0,
            "disputes_lost":       0,
            "ghosting_incidents":  0,
            "avg_response_hours":  None,
            "usdc_earned":         0.0,
            "usdc_spent":          0.0,
            "usdc_balance":        0.0,
            "signal_tags":         ["New account"],
            "is_new":              True,
        }

    rep  = user.reputation
    # ✅ FIX: Guard against missing Reputation row — possible if record was created
    # outside the normal flow (e.g. direct DB insert, migration gap, merge edge case).
    if rep is None:
        return {
            "address":             user.wallet_address,   # ✅ alias frontend expects
            "wallet_address":      user.wallet_address,
            "display_name":        user.display_name,
            "score":               0.0,
            "total_contracts":     0,
            "completed_contracts": 0,
            "disputes_raised":     0,
            "disputes_won":        0,
            "disputes_lost":       0,
            "ghosting_incidents":  0,
            "avg_response_hours":  None,
            "usdc_earned":         0.0,
            "usdc_spent":          0.0,
            "usdc_balance":        0.0,
            "signal_tags":         ["New account"],
            "is_new":              True,
        }
    tags = _build_tags(rep)
    return {
        "address":             user.wallet_address,   # ✅ alias frontend expects
        "wallet_address":      user.wallet_address,
        "display_name":        user.display_name,
        "score":               rep.score,
        "total_contracts":     rep.total_contracts,
        "completed_contracts": rep.completed_contracts,
        "disputes_raised":     rep.disputes_raised,
        "disputes_won":        rep.disputes_won,
        "disputes_lost":       rep.disputes_lost,
        "ghosting_incidents":  rep.ghosting_incidents,
        "avg_response_hours":  rep.avg_response_hours,
        "usdc_earned":         round(rep.usdc_earned  or 0.0, 4),
        "usdc_spent":          round(rep.usdc_spent   or 0.0, 4),
        "usdc_balance":        round(rep.usdc_balance or 0.0, 4),
        "signal_tags":         tags,
        "is_new":              rep.total_contracts == 0,
    }


def _build_tags(rep: Reputation) -> list[str]:
    if rep.total_contracts == 0:
        return ["New account"]
    tags = []
    if rep.ghosting_incidents == 0 and rep.total_contracts >= 3:
        tags.append("No ghosting record")
    if rep.avg_response_hours and rep.avg_response_hours < 6:
        tags.append("Fast responder")
    if rep.completed_contracts >= 10:
        tags.append("Experienced")
    if rep.score >= 4.5:
        tags.append("Highly trusted")
    if rep.ghosting_incidents > 0:
        tags.append(f"Ghosted {rep.ghosting_incidents}x")
    if rep.disputes_lost > 1:
        tags.append("High dispute rate")
    return tags