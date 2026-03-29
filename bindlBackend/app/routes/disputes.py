import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.models.models import (
    Contract, Dispute, User, Reputation,
    ContractStatus, DisputeStatus, DisputeReason, AuditEvent
)
from app.services.audit import write_audit
from app.validators import validate_ethereum_address

router = APIRouter()


class DisputeCreate(BaseModel):
    contract_link_token: str
    raised_by_wallet: str
    reason: DisputeReason
    description: str
    evidence_urls: Optional[list[str]] = None


@router.post("/", status_code=201)
def raise_dispute(data: DisputeCreate, request: Request = None, db: Session = Depends(get_db)):
    # Validate wallet format
    is_valid, error = validate_ethereum_address(data.raised_by_wallet)
    if not is_valid:
        raise HTTPException(400, f"Invalid raised_by_wallet: {error}")
    
    contract = db.query(Contract).filter(Contract.link_token == data.contract_link_token).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.status not in [ContractStatus.LOCKED, ContractStatus.MILESTONE]:
        raise HTTPException(400, f"Cannot dispute a contract in '{contract.status.value}' state")

    user = db.query(User).filter(User.wallet_address == data.raised_by_wallet.lower()).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.id not in [contract.party_a_id, contract.party_b_id]:
        raise HTTPException(403, "Only parties to the contract can raise a dispute")

    dispute = Dispute(
        contract_id    = contract.id,
        raised_by_id   = user.id,
        reason         = data.reason,
        description    = data.description,
        evidence_urls  = json.dumps(data.evidence_urls or []),
        status         = DisputeStatus.OPEN,
        deposit_paid   = False,
        deposit_waived = False,
    )
    db.add(dispute)
    contract.status = ContractStatus.DISPUTED

    rep = db.query(Reputation).filter(Reputation.user_id == user.id).first()
    if rep:
        rep.disputes_raised += 1

    write_audit(db, contract.id, user.id, AuditEvent.DISPUTED, {"reason": data.reason.value})
    db.commit()
    db.refresh(dispute)

    next_steps = {
        DisputeReason.BAD_MATCH:    "72-hour negotiation window opened.",
        DisputeReason.QUALITY:      "Submit evidence. Peer review assigned within 24 hours.",
        DisputeReason.LOST_TRANSIT: "Provide tracking number for verification.",
        DisputeReason.NO_DELIVERY:  "Submit proof. Peer review will be assigned.",
        DisputeReason.OTHER:        "A mediator will review within 24 hours.",
    }

    return {
        "dispute_id": str(dispute.id),
        "status":     dispute.status.value,
        "reason":     dispute.reason.value,
        "next_step":  next_steps.get(data.reason, "Dispute filed."),
    }
