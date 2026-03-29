from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json

from app.core.database import get_db
from app.models.models import Contract, Amendment, User, ContractStatus, AmendmentStatus, AuditEvent
from app.services.audit import write_audit

router = APIRouter()


class AmendmentCreate(BaseModel):
    contract_link_token: str
    proposed_by_wallet: str
    reason: str
    new_amount_usdc: Optional[float]     = None
    new_deadline: Optional[datetime]     = None
    new_deliverables: Optional[list[str]] = None
    new_revision_count: Optional[int]   = None


@router.post("/", status_code=201)
def propose_amendment(data: AmendmentCreate, db: Session = Depends(get_db)):
    contract = db.query(Contract).filter(Contract.link_token == data.contract_link_token).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.status not in [ContractStatus.DRAFT, ContractStatus.LOCKED]:
        raise HTTPException(400, "Can only amend DRAFT or LOCKED contracts")

    active = db.query(Amendment).filter(
        Amendment.contract_id == contract.id,
        Amendment.status == AmendmentStatus.PENDING
    ).first()
    if active:
        raise HTTPException(409, "There is already a pending amendment")

    user = db.query(User).filter(User.wallet_address == data.proposed_by_wallet.lower()).first()
    if not user:
        raise HTTPException(404, "User not found")

    amendment = Amendment(
        contract_id        = contract.id,
        proposed_by_id     = user.id,
        status             = AmendmentStatus.PENDING,
        reason             = data.reason,
        new_amount_usdc    = data.new_amount_usdc,
        new_deadline       = data.new_deadline,
        new_deliverables   = json.dumps(data.new_deliverables) if data.new_deliverables else None,
        new_revision_count = data.new_revision_count,
        expires_at         = datetime.utcnow() + timedelta(hours=48),
    )
    db.add(amendment)
    write_audit(db, contract.id, user.id, AuditEvent.AMENDED, {"action": "proposed"})
    db.commit()
    db.refresh(amendment)

    return {"amendment_id": str(amendment.id), "expires_at": amendment.expires_at.isoformat(),
            "message": "Amendment proposed. Other party has 48 hours to respond."}


@router.post("/{amendment_id}/accept")
def accept_amendment(amendment_id: str, wallet: str, db: Session = Depends(get_db)):
    amendment = db.query(Amendment).filter(Amendment.id == amendment_id).first()
    if not amendment:
        raise HTTPException(404, "Amendment not found")
    if amendment.status != AmendmentStatus.PENDING:
        raise HTTPException(400, f"Amendment is {amendment.status.value}")
    if datetime.utcnow() > amendment.expires_at:
        amendment.status = AmendmentStatus.EXPIRED
        db.commit()
        raise HTTPException(400, "Amendment has expired")

    contract = db.query(Contract).filter(Contract.id == amendment.contract_id).first()
    if amendment.new_amount_usdc:    contract.amount_usdc   = amendment.new_amount_usdc
    if amendment.new_deadline:       contract.deadline      = amendment.new_deadline
    if amendment.new_deliverables:   contract.deliverables  = amendment.new_deliverables
    if amendment.new_revision_count is not None:
        contract.revision_count = amendment.new_revision_count

    from app.routes.contracts import hash_terms
    contract.terms_hash    = hash_terms(contract)
    amendment.status       = AmendmentStatus.ACCEPTED
    amendment.responded_at = datetime.utcnow()

    user = db.query(User).filter(User.wallet_address == wallet.lower()).first()
    write_audit(db, contract.id, user.id if user else None, AuditEvent.AMENDED,
                {"action": "accepted", "new_terms_hash": contract.terms_hash})
    db.commit()
    return {"accepted": True, "new_terms_hash": contract.terms_hash}


@router.post("/{amendment_id}/reject")
def reject_amendment(amendment_id: str, wallet: str, db: Session = Depends(get_db)):
    amendment = db.query(Amendment).filter(Amendment.id == amendment_id).first()
    if not amendment:
        raise HTTPException(404, "Amendment not found")
    amendment.status       = AmendmentStatus.REJECTED
    amendment.responded_at = datetime.utcnow()
    user = db.query(User).filter(User.wallet_address == wallet.lower()).first()
    write_audit(db, amendment.contract_id, user.id if user else None,
                AuditEvent.AMENDED, {"action": "rejected"})
    db.commit()
    return {"rejected": True, "message": "Original contract terms remain in effect."}
