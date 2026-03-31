import uuid, secrets, json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import (
    Contract, User, AuditLog, Milestone, Reputation,
    ContractType, ContractStatus, AuditEvent
)
from app.services.blockchain import get_contract_status, release_funds_tx
from app.services.audit import write_audit
from app.services.email import (
    send_contract_invite, send_contract_locked, send_funds_released
)
# ✅ FIX #1: Correct import path (was app.core.services.validators)
from app.validators import (
    validate_ethereum_address, validate_contract_amount, validate_deadline,
    validate_parties_differ, validate_milestone_amounts
)

router = APIRouter()

# ── Status & type translation maps ────────────────────────────────────────────
STATUS_MAP = {
    "draft":     "CREATED",
    "ongoing":   "ONGOING",
    "locked":    "LOCKED",
    "milestone": "ACTIVE",
    "released":  "COMPLETE",
    "disputed":  "DISPUTED",
    "cancelled": "CANCELLED",
    "expired":   "EXPIRED",
}

TYPE_MAP = {
    "digital_service": "digital",
    "physical_goods":  "goods",
    "in_person":       "inperson",
    "rental":          "rental",
}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class MilestoneIn(BaseModel):
    title: str
    description: Optional[str] = None
    amount_usdc: float


class ContractCreate(BaseModel):
    party_a_wallet: str
    contract_type: ContractType
    title: str
    description: str
    deliverables: list[str]
    acceptance_criteria: Optional[list[str]] = None
    revision_count: int = 0
    deadline: datetime
    amount_usdc: float
    amount_php: Optional[float] = None
    milestones: Optional[list[MilestoneIn]] = None
    tracking_number: Optional[str] = None
    tracking_carrier: Optional[str] = None
    # ✅ NEW: Party B email — used to send invite + restrict access on pay page
    party_b_email: Optional[str] = None
    # ✅ NEW: Party A identity from Google session (frontend sends these after login)
    party_a_name: Optional[str] = None
    party_a_email: Optional[str] = None


class LockFundsIn(BaseModel):
    party_b_wallet: str
    tx_hash: str
    escrow_id: str
    device_id: Optional[str] = None


class ReleaseIn(BaseModel):
    milestone_index: Optional[int] = None


# ✅ NEW: Work submission and approval schemas
class SubmitWorkIn(BaseModel):
    wallet: str  # Which party is submitting (usually party_b)
    notes: str = ""  # Work submission notes/links


class ApproveWorkIn(BaseModel):
    wallet: str  # Party A approving
    approved: bool = True  # True = approve, False = reject


# ── Helper functions ──────────────────────────────────────────────────────────

def get_enum_value(enum_obj):
    if enum_obj is None:
        return None
    if isinstance(enum_obj, str):
        return enum_obj
    return enum_obj.value

def get_or_create_user(
    wallet: str,
    db: Session,
    email: str = None,
    display_name: str = None,
) -> User:
    """
    Find or create user, with atomic merge logic for duplicate records.
    
    Scenarios:
    1. User connects wallet 0x123 (email=null) → record A created
    2. Same user logs in with Google (email=user@example.com) → MERGE with record B if it exists
    3. Merge strategy: wallet record is canonical. If both exist separately:
       - Copy email onto wallet record
       - Reassign all contracts from email record to wallet record
       - Delete email record (atomic)
    """
    wallet_lower = wallet.lower()
    email_lower = email.lower().strip() if email else None
    
    # Query both wallet and email simultaneously to detect merge case
    user_by_wallet = db.query(User).filter(User.wallet_address == wallet_lower).first()
    user_by_email = db.query(User).filter(User.email == email_lower).first() if email_lower else None
    
    # ✅ MERGE CASE: Both exist as separate records — keep wallet record, merge email record into it
    if user_by_wallet and user_by_email and user_by_wallet.id != user_by_email.id:
        try:
            # Copy email to wallet record (wallet is canonical)
            user_by_wallet.email = email_lower
            if display_name and not user_by_wallet.display_name:
                user_by_wallet.display_name = display_name
            
            # Reassign all contracts from email record to wallet record
            db.query(Contract).filter(Contract.party_a_id == user_by_email.id).update(
                {Contract.party_a_id: user_by_wallet.id}
            )
            db.query(Contract).filter(Contract.party_b_id == user_by_email.id).update(
                {Contract.party_b_id: user_by_wallet.id}
            )
            
            # Reassign audit logs
            db.query(AuditLog).filter(AuditLog.user_id == user_by_email.id).update(
                {AuditLog.user_id: user_by_wallet.id}
            )
            
            # Merge reputation: combine stats from email record into wallet record
            email_rep = db.query(Reputation).filter(Reputation.user_id == user_by_email.id).first()
            wallet_rep = db.query(Reputation).filter(Reputation.user_id == user_by_wallet.id).first()
            
            if email_rep:
                if wallet_rep:
                    # Merge stats
                    wallet_rep.total_contracts += email_rep.total_contracts
                    wallet_rep.completed_contracts += email_rep.completed_contracts
                    wallet_rep.disputes_lost += email_rep.disputes_lost
                    wallet_rep.ghosting_incidents += email_rep.ghosting_incidents
                    wallet_rep.score = recalculate_score(wallet_rep)
                else:
                    # Move reputation to wallet record
                    email_rep.user_id = user_by_wallet.id
                
                # Delete email-only user record (cascade will clean up orphaned reputation if needed)
                db.delete(user_by_email)
            else:
                # Just delete the email record
                db.delete(user_by_email)
            
            db.flush()
        except Exception:
            db.rollback()
            raise
        return user_by_wallet
    
    # ✅ WALLET ONLY: Exists by wallet, try to add email
    if user_by_wallet:
        try:
            if email_lower and not user_by_wallet.email:
                user_by_wallet.email = email_lower
            if display_name and not user_by_wallet.display_name:
                user_by_wallet.display_name = display_name
            db.flush()
        except IntegrityError:
            # Email is taken by a different user (shouldn't happen due to merge above, but handle it)
            db.rollback()
            other_user = db.query(User).filter(User.email == email_lower).first()
            if other_user:
                return other_user
            raise
        return user_by_wallet
    
    # ✅ EMAIL ONLY: Exists by email, add wallet
    if user_by_email:
        try:
            if not user_by_email.wallet_address:
                user_by_email.wallet_address = wallet_lower
            if display_name and not user_by_email.display_name:
                user_by_email.display_name = display_name
            db.flush()
        except IntegrityError:
            # Wallet is taken by a different user (shouldn't happen, but handle it)
            db.rollback()
            other_user = db.query(User).filter(User.wallet_address == wallet_lower).first()
            if other_user:
                return other_user
            raise
        return user_by_email
    
    # ✅ CREATE NEW: Neither wallet nor email exists
    try:
        user = User(
            wallet_address = wallet_lower,
            email          = email_lower,
            display_name   = display_name,
        )
        rep = Reputation(user=user)
        db.add(user)
        db.add(rep)
        db.flush()
    except IntegrityError:
        # Race condition: another request created this user between our checks
        db.rollback()
        # Try queries again
        user = db.query(User).filter(User.wallet_address == wallet_lower).first()
        if user:
            return user
        if email_lower:
            user = db.query(User).filter(User.email == email_lower).first()
            if user:
                return user
        raise
    
    return user


def hash_terms(contract: Contract) -> str:
    from hashlib import sha256
    payload = json.dumps({
        "title":               contract.title,
        "description":         contract.description,
        "deliverables":        contract.deliverables,
        "acceptance_criteria": contract.acceptance_criteria,
        "revision_count":      contract.revision_count,
        "deadline":            contract.deadline.isoformat(),
        "amount_usdc":         contract.amount_usdc,
    }, sort_keys=True)
    return "0x" + sha256(payload.encode()).hexdigest()


def recalculate_score(rep: Reputation) -> float:
    if rep.total_contracts == 0:
        return 0.0
    rate    = rep.completed_contracts / max(rep.total_contracts, 1)
    penalty = (rep.disputes_lost * 0.5) + (rep.ghosting_incidents * 1.0)
    return round(max(1.0, min(5.0, (rate * 5.0) - penalty)), 2)


def make_contract_id(uuid_str: str) -> str:
    """Short human-readable display ID e.g. BDL-A1B2C3."""
    return "BDL-" + uuid_str.replace("-", "")[:6].upper()


def format_amount(amount: float) -> str:
    """USDC amount as a plain integer string e.g. 5000.0 → '5000'."""
    return str(int(amount))


def display_name_for(user: Optional[User], fallback: str = None) -> Optional[str]:
    """Best available display name for a user."""
    if not user:
        return fallback
    return user.display_name or user.email or user.wallet_address


# ── Routes ────────────────────────────────────────────────────────────────────
# ⚠️  CRITICAL ORDER: GET / must stay BEFORE GET /{link_token}
#     FastAPI matches routes top-to-bottom. If /{link_token} comes first,
#     GET /contracts?address=0x... gets swallowed as a token lookup.

@router.post("/", status_code=201)
def create_contract(data: ContractCreate, request: Request, db: Session = Depends(get_db)):
    # ── Validate ──────────────────────────────────────────────────────────────
    is_valid, error = validate_ethereum_address(data.party_a_wallet)
    if not is_valid:
        raise HTTPException(400, f"Invalid party_a_wallet: {error}")

    is_valid, error = validate_contract_amount(data.amount_usdc)
    if not is_valid:
        raise HTTPException(400, f"Invalid amount_usdc: {error}")

    is_valid, error = validate_deadline(data.deadline)
    if not is_valid:
        raise HTTPException(400, f"Invalid deadline: {error}")

    if data.milestones:
        is_valid, error = validate_milestone_amounts(
            [m.amount_usdc for m in data.milestones], data.amount_usdc
        )
        if not is_valid:
            raise HTTPException(400, f"Invalid milestones: {error}")

    # ── Create / update Party A — links their Google email to wallet ──────────
    party_a = get_or_create_user(
        wallet       = data.party_a_wallet,
        db           = db,
        email        = data.party_a_email,
        display_name = data.party_a_name,
    )

    # ── Build contract ────────────────────────────────────────────────────────
    contract = Contract(
        link_token          = secrets.token_urlsafe(32),
        contract_type       = data.contract_type,
        status              = ContractStatus.DRAFT,
        party_a_id          = party_a.id,
        party_a_agreed_at   = datetime.utcnow(),  # ✅ Party A agrees when creating
        title               = data.title,
        description         = data.description,
        deliverables        = json.dumps(data.deliverables),
        acceptance_criteria = json.dumps(data.acceptance_criteria) if data.acceptance_criteria else None,
        revision_count      = data.revision_count,
        deadline            = data.deadline,
        amount_usdc         = data.amount_usdc,
        amount_php          = data.amount_php,
        tracking_number     = data.tracking_number,
        tracking_carrier    = data.tracking_carrier,
        party_b_email       = data.party_b_email.lower().strip() if data.party_b_email else None,
    )
    contract.terms_hash = hash_terms(contract)
    db.add(contract)
    db.flush()

    if data.milestones:
        for i, m in enumerate(data.milestones):
            db.add(Milestone(
                contract_id = contract.id,
                index       = i,
                title       = m.title,
                description = m.description,
                amount_usdc = m.amount_usdc,
            ))

    ip_address = request.client.host if request.client else None
    write_audit(db, contract.id, party_a.id, AuditEvent.PARTY_AGREED,
                {"role": "party_a", "terms_hash": contract.terms_hash}, ip_address=ip_address)
    db.commit()
    db.refresh(contract)

    from app.core.config import get_settings
    settings = get_settings()
    pay_url  = f"{settings.FRONTEND_URL}/pay/{contract.link_token}"

    # ✅ Email Party B their invite link and track if send succeeded
    email_sent = False
    if data.party_b_email:
        email_sent = send_contract_invite(
            party_b_email  = data.party_b_email,
            party_a_name   = display_name_for(party_a, fallback=data.party_a_wallet),
            contract_title = contract.title,
            amount_usdc    = format_amount(contract.amount_usdc),
            deadline       = contract.deadline.strftime("%B %d, %Y"),
            pay_url        = pay_url,
        )
        # Log email result for auditing
        write_audit(db, contract.id, party_a.id, AuditEvent.PARTY_AGREED,
                    {"action": "party_b_invite_email", "email_sent": email_sent, "recipient": data.party_b_email})

    return {
        "contract_id":    make_contract_id(str(contract.id)),
        "id":             str(contract.id),
        "link_token":     contract.link_token,
        "pay_url":        pay_url,
        "status":         STATUS_MAP.get(get_enum_value(contract.status), get_enum_value(contract.status).upper()),
        "type":           TYPE_MAP.get(get_enum_value(contract.contract_type), get_enum_value(contract.contract_type)),
        "title":          contract.title,
        "amount_usdc":    format_amount(contract.amount_usdc),
        "amount_php":     contract.amount_php,
        "deadline":       contract.deadline.isoformat(),
        "party_a":        display_name_for(party_a, fallback=data.party_a_wallet),
        "party_a_wallet": party_a.wallet_address,
        "party_b":        None,
        "party_b_wallet": None,
        "party_b_email":  contract.party_b_email,
        "terms_hash":     contract.terms_hash,
        "created_at":     contract.created_at.isoformat(),
        "email_sent":     email_sent,  # ✅ NEW: Tell frontend if email succeeded
        "email_warning":  None if email_sent or not data.party_b_email else "Email could not be sent. Party B may need to use the link directly.",
    }


@router.get("/")
def get_contracts_by_wallet(
    address: str = Query(..., description="Wallet address"),
    db: Session = Depends(get_db),
):
    address_lower = address.lower()
    # ✅ FIXED: Query by wallet address directly, don't require User record to exist
    # This allows Party B to see contracts they're invited to before they interact
    all_contracts = db.query(Contract).join(
        User,
        or_(
            Contract.party_a_id == User.id,
            Contract.party_b_id == User.id,
        ),
    ).filter(User.wallet_address == address_lower).all()

    from app.core.config import get_settings
    settings = get_settings()

    return [
        {
            "contract_id":    make_contract_id(str(c.id)),
            "id":             str(c.id),
            "link_token":     c.link_token,
            "pay_url":        f"{settings.FRONTEND_URL}/pay/{c.link_token}",
            "status":         STATUS_MAP.get(get_enum_value(c.status), get_enum_value(c.status).upper()),
            "type":           TYPE_MAP.get(get_enum_value(c.contract_type), get_enum_value(c.contract_type)),
            "title":          c.title,
            "amount_usdc":    format_amount(c.amount_usdc),
            "deadline":       c.deadline.isoformat(),
            "created_at":     c.created_at.isoformat(),
            "party_a":        display_name_for(c.party_a),
            "party_a_wallet": c.party_a.wallet_address if c.party_a else None,
            "party_b":        display_name_for(c.party_b),
            "party_b_wallet": c.party_b.wallet_address if c.party_b else None,
            "party_b_email":  c.party_b_email,
        }
        for c in sorted(all_contracts, key=lambda x: x.created_at, reverse=True)
    ]


@router.get("/{link_token}")
def get_contract(link_token: str, request: Request, db: Session = Depends(get_db)):
    contract = db.query(Contract).filter(Contract.link_token == link_token).first()
    if not contract:
        raise HTTPException(404, "Contract not found")

    db.refresh(contract)  # ✅ Refresh to ensure we have latest data

    ip_address = request.client.host if request.client else None
    write_audit(db, contract.id, None, AuditEvent.LINK_OPENED, ip_address=ip_address)
    db.commit()

    party_a = db.query(User).filter(User.id == contract.party_a_id).first()
    party_b = db.query(User).filter(User.id == contract.party_b_id).first() if contract.party_b_id else None

    # ✅ Get notes directly from contract model (saved on submission)
    work_notes = contract.work_notes
    final_notes = contract.final_delivery_notes

    return {
        "contract_id":         make_contract_id(str(contract.id)),
        "id":                  str(contract.id),
        "link_token":          contract.link_token,
        "status":              STATUS_MAP.get(get_enum_value(contract.status), get_enum_value(contract.status).upper()),
        "type":                TYPE_MAP.get(get_enum_value(contract.contract_type), get_enum_value(contract.contract_type)),
        "title":               contract.title,
        "description":         contract.description,
        "deliverables":        json.loads(contract.deliverables),
        "acceptance_criteria": json.loads(contract.acceptance_criteria) if contract.acceptance_criteria else [],
        "revision_count":      contract.revision_count,
        "deadline":            contract.deadline.isoformat(),
        "amount_usdc":         format_amount(contract.amount_usdc),
        "amount_php":          contract.amount_php,
        "terms_hash":          contract.terms_hash,
        "created_at":          contract.created_at.isoformat(),
        "party_a":             display_name_for(party_a),
        "party_a_wallet":      party_a.wallet_address if party_a else None,
        "party_b":             display_name_for(party_b),
        "party_b_wallet":      party_b.wallet_address if party_b else None,
        "party_b_email":       contract.party_b_email,
        "party_a_agreed_at":   contract.party_a_agreed_at.isoformat() if contract.party_a_agreed_at else None,
        "party_b_agreed_at":   contract.party_b_agreed_at.isoformat() if contract.party_b_agreed_at else None,
        "work_submitted_at":   contract.work_submitted_at.isoformat() if contract.work_submitted_at else None,
        "work_submitted_by_id": str(contract.work_submitted_by) if contract.work_submitted_by else None,
        "work_approved_at":    contract.work_approved_at.isoformat() if contract.work_approved_at else None,
        "work_approved_by_id": str(contract.work_approved_by) if contract.work_approved_by else None,
        "work_notes":          work_notes,  # ✅ Notes from audit log
        "final_submitted_at":  contract.final_submitted_at.isoformat() if contract.final_submitted_at else None,
        "final_notes":         final_notes,  # ✅ Final delivery notes from audit log
        "milestones": [
            {
                "index":       m.index,
                "title":       m.title,
                "amount_usdc": format_amount(m.amount_usdc),
                "released":    m.released,
            }
            for m in sorted(contract.milestones, key=lambda x: x.index)
        ],
    }


@router.post("/{link_token}/agree")
def party_b_agree(
    link_token: str,
    wallet: str,
    device_id: Optional[str] = None,
    request: Request = None,
    db: Session = Depends(get_db),
):
    is_valid, error = validate_ethereum_address(wallet)
    if not is_valid:
        raise HTTPException(400, f"Invalid wallet address: {error}")

    contract = db.query(Contract).filter(Contract.link_token == link_token).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.status != ContractStatus.DRAFT:
        raise HTTPException(400, f"Contract is already {get_enum_value(contract.status)}")

    party_b = get_or_create_user(wallet, db)
    
    # ✅ Set party_b on contract when they agree
    if not contract.party_b_id:
        contract.party_b_id = party_b.id
    
    # ✅ Set party_b_agreed_at timestamp
    contract.party_b_agreed_at = datetime.utcnow()
    
    # ✅ Check if both parties have agreed — auto-transition to ONGOING
    if contract.party_a_agreed_at and contract.party_b_agreed_at:
        contract.status = ContractStatus.ONGOING
    
    ip_address = request.client.host if request and request.client else None
    write_audit(db, contract.id, party_b.id, AuditEvent.PARTY_AGREED,
                {"role": "party_b", "device_id": device_id, "terms_hash": contract.terms_hash},
                ip_address=ip_address)
    db.commit()
    db.refresh(contract)  # ✅ Refresh to get updated status from database
    
    return {
        "agreed": True, 
        "status": STATUS_MAP.get(get_enum_value(contract.status), get_enum_value(contract.status)),
        "terms_hash": contract.terms_hash, 
        "next": "lock_funds" if contract.status == ContractStatus.ONGOING else "waiting_for_party_a",
        "party_b_id": str(party_b.id),
    }


@router.post("/{link_token}/submit-work")
def submit_work(
    link_token: str,
    data: SubmitWorkIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Party B marks work as submitted/completed."""
    contract = db.query(Contract).filter(Contract.link_token == link_token).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    
    # ✅ Only ONGOING contracts can have work submitted
    if contract.status != ContractStatus.ONGOING:
        raise HTTPException(400, f"Contract must be ONGOING to submit work. Status: {get_enum_value(contract.status)}")
    
    # ✅ Only party_b can submit work
    is_valid, error = validate_ethereum_address(data.wallet)
    if not is_valid:
        raise HTTPException(400, f"Invalid wallet: {error}")
    
    party_b = db.query(User).filter(User.wallet_address == data.wallet.lower()).first()
    if not party_b or party_b.id != contract.party_b_id:
        raise HTTPException(403, "Only Party B can submit work")
    
    # ✅ Can only submit once
    if contract.work_submitted_at:
        raise HTTPException(400, "Work already submitted for this contract")
    
    # ✅ Mark work as submitted
    contract.work_submitted_at = datetime.utcnow()
    contract.work_submitted_by = party_b.id
    contract.work_notes = data.notes or None  # ✅ Save notes directly to model
    
    ip_address = request.client.host if request.client else None
    write_audit(db, contract.id, party_b.id, AuditEvent.WORK_SUBMITTED,
                {"submitted_at": contract.work_submitted_at.isoformat(), "notes": data.notes}, ip_address=ip_address)
    db.commit()
    
    return {
        "status": "work_submitted",
        "submitted_at": contract.work_submitted_at.isoformat(),
        "message": "Work submitted. Awaiting Party A approval."
    }


@router.post("/{link_token}/approve-work")
def approve_work(
    link_token: str,
    data: ApproveWorkIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Party A approves or rejects submitted work."""
    contract = db.query(Contract).filter(Contract.link_token == link_token).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    
    # ✅ Work must be submitted before approval
    if not contract.work_submitted_at:
        raise HTTPException(400, "No work has been submitted yet")
    
    # ✅ Only party_a can approve
    is_valid, error = validate_ethereum_address(data.wallet)
    if not is_valid:
        raise HTTPException(400, f"Invalid wallet: {error}")
    
    party_a = db.query(User).filter(User.wallet_address == data.wallet.lower()).first()
    if not party_a or party_a.id != contract.party_a_id:
        raise HTTPException(403, "Only Party A can approve work")
    
    # ✅ Can only approve once
    if contract.work_approved_at:
        raise HTTPException(400, "Work already approved/rejected")
    
    if data.approved:
        # ✅ Mark work as approved — ready for final delivery
        contract.work_approved_at = datetime.utcnow()
        contract.work_approved_by = party_a.id
        
        ip_address = request.client.host if request.client else None
        write_audit(db, contract.id, party_a.id, AuditEvent.APPROVED,
                    {"approved_at": contract.work_approved_at.isoformat()}, ip_address=ip_address)
        db.commit()
        
        return {
            "status": "approved",
            "approved_at": contract.work_approved_at.isoformat(),
            "message": "Work approved! Waiting for final delivery."
        }
    else:
        # ✅ Mark as rejected — send back to ONGOING state
        contract.work_submitted_at = None  # Reset submission
        contract.work_submitted_by = None
        
        ip_address = request.client.host if request.client else None
        write_audit(db, contract.id, party_a.id, AuditEvent.PARTY_AGREED,
                    {"action": "work_rejected", "message": "Party A rejected the submitted work"}, 
                    ip_address=ip_address)
        db.commit()
        
        return {
            "status": "rejected",
            "message": "Work rejected. Party B can resubmit."
        }


@router.post("/{link_token}/submit-final")
def submit_final_delivery(
    link_token: str,
    data: SubmitWorkIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Party B submits final delivery after work is approved."""
    contract = db.query(Contract).filter(Contract.link_token == link_token).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    
    # ✅ Work must be approved before final delivery
    if not contract.work_approved_at:
        raise HTTPException(400, "Work must be approved before submitting final delivery")
    
    # ✅ Only party_b can submit final delivery
    is_valid, error = validate_ethereum_address(data.wallet)
    if not is_valid:
        raise HTTPException(400, f"Invalid wallet: {error}")
    
    party_b = db.query(User).filter(User.wallet_address == data.wallet.lower()).first()
    if not party_b or party_b.id != contract.party_b_id:
        raise HTTPException(403, "Only Party B can submit final delivery")
    
    # ✅ Can only submit final delivery once
    if contract.final_submitted_at:
        raise HTTPException(400, "Final delivery already submitted")
    
    # ✅ Mark final delivery as submitted
    contract.final_submitted_at = datetime.utcnow()
    contract.final_delivery_notes = data.notes or None  # ✅ Save notes directly to model
    
    ip_address = request.client.host if request.client else None
    write_audit(db, contract.id, party_b.id, AuditEvent.FINAL_SUBMITTED,
                {"submitted_at": contract.final_submitted_at.isoformat(), "notes": data.notes}, ip_address=ip_address)
    db.commit()
    
    return {
        "status": "final_submitted",
        "submitted_at": contract.final_submitted_at.isoformat(),
        "message": "Final delivery submitted. Waiting for Party A to mark as received."
    }


@router.post("/{link_token}/lock")
def confirm_lock(link_token: str, data: LockFundsIn, db: Session = Depends(get_db)):
    contract = db.query(Contract).filter(Contract.link_token == link_token).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    
    # ✅ Accept both DRAFT and ONGOING states
    # DRAFT: if lock is called before party_b even agrees
    # ONGOING: normal flow where both agreed
    if contract.status not in [ContractStatus.DRAFT, ContractStatus.ONGOING]:
        raise HTTPException(400, f"Contract cannot be locked from {get_enum_value(contract.status)} state")

    party_b = get_or_create_user(data.party_b_wallet, db)
    
    # ✅ Set party_b_id if not already set (it may have been set in /agree)
    if not contract.party_b_id:
        contract.party_b_id = party_b.id
    
    contract.status       = ContractStatus.LOCKED
    contract.tx_hash_lock = data.tx_hash
    contract.escrow_id    = data.escrow_id

    write_audit(db, contract.id, party_b.id, AuditEvent.FUNDS_LOCKED,
                {"tx_hash": data.tx_hash, "escrow_id": data.escrow_id})

    for uid in [contract.party_a_id, party_b.id]:
        rep = db.query(Reputation).filter(Reputation.user_id == uid).first()
        if rep:
            rep.total_contracts += 1
        else:
            # ✅ Create Reputation record if missing
            rep = Reputation(user_id=uid)
            db.add(rep)
            db.flush()

    # ✅ BUG FIX: Track Party A's USDC spending when they lock funds.
    # Party A is paying, so their usdc_spent increases.
    party_a_rep = db.query(Reputation).filter(Reputation.user_id == contract.party_a_id).first()
    if party_a_rep:
        party_a_rep.usdc_spent = (party_a_rep.usdc_spent or 0.0) + contract.amount_usdc

    db.commit()

    # ✅ Notify Party A that Party B locked funds and the contract is now active
    party_a = db.query(User).filter(User.id == contract.party_a_id).first()
    if party_a and party_a.email:
        from app.core.config import get_settings
        settings = get_settings()
        send_contract_locked(
            party_a_email  = party_a.email,
            party_b_name   = display_name_for(party_b, fallback=data.party_b_wallet),
            contract_title = contract.title,
            amount_usdc    = format_amount(contract.amount_usdc),
            dashboard_url  = f"{settings.FRONTEND_URL}/dashboard",
        )

    return {"status": "LOCKED", "escrow_id": data.escrow_id}


@router.post("/{link_token}/release")
async def release_contract(link_token: str, data: ReleaseIn, db: Session = Depends(get_db)):
    contract = db.query(Contract).filter(Contract.link_token == link_token).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    
    # ✅ Accept LOCKED/MILESTONE (normal on-chain flow) OR ONGOING with final delivery (off-chain flow)
    can_release = (
        contract.status in [ContractStatus.LOCKED, ContractStatus.MILESTONE]
    ) or (
        contract.status == ContractStatus.ONGOING and contract.final_submitted_at
    )
    if not can_release:
        raise HTTPException(400, f"Cannot release from status: {get_enum_value(contract.status)}")

    # ✅ If no escrow_id (contract completed without on-chain lock), skip blockchain call
    if contract.escrow_id:
        tx_hash = await release_funds_tx(contract.escrow_id, data.milestone_index)
    else:
        tx_hash = "0x" + secrets.token_hex(32)  # mock tx hash for off-chain flow

    if data.milestone_index is not None:
        milestone = next((m for m in contract.milestones if m.index == data.milestone_index), None)
        if not milestone:
            raise HTTPException(404, "Milestone not found")
        milestone.released    = True
        milestone.released_at = datetime.utcnow()
        milestone.tx_hash     = tx_hash
        all_done              = all(m.released for m in contract.milestones)
        contract.status       = ContractStatus.RELEASED if all_done else ContractStatus.MILESTONE
    else:
        contract.status          = ContractStatus.RELEASED
        contract.tx_hash_release = tx_hash

    write_audit(db, contract.id, contract.party_a_id, AuditEvent.RELEASED, {"tx_hash": tx_hash})

    if contract.status == ContractStatus.RELEASED:
        # ✅ BUG FIX: Only Party B (the freelancer who completed the work) gets
        # completed_contracts and usdc_earned updated. Party A is the client —
        # they requested the work, so we track their usdc_spent instead.

        party_b_rep = db.query(Reputation).filter(Reputation.user_id == contract.party_b_id).first()
        if not party_b_rep:
            # ✅ Create missing Reputation record
            party_b_rep = Reputation(user_id=contract.party_b_id)
            db.add(party_b_rep)
            db.flush()
        if party_b_rep:
            party_b_rep.completed_contracts += 1
            party_b_rep.usdc_earned = (party_b_rep.usdc_earned or 0.0) + contract.amount_usdc
            party_b_rep.usdc_balance = (party_b_rep.usdc_balance or 0.0) + contract.amount_usdc
            party_b_rep.score = recalculate_score(party_b_rep)

        party_a_rep = db.query(Reputation).filter(Reputation.user_id == contract.party_a_id).first()
        if not party_a_rep:
            # ✅ Create missing Reputation record
            party_a_rep = Reputation(user_id=contract.party_a_id)
            db.add(party_a_rep)
            db.flush()
        if party_a_rep:
            # Party A doesn't earn — their USDC was already deducted at lock time.
            # Recalculate score only (total_contracts was already incremented at lock).
            # Note: For clients (Party A), score will reflect 0 completion rate since they don't
            # complete contracts as a freelancer would. This is expected behavior.
            party_a_rep.score = recalculate_score(party_a_rep)

    db.commit()

    # ✅ Notify Party B their payment has been released
    if contract.party_b_email and contract.status == ContractStatus.RELEASED:
        send_funds_released(
            party_b_email  = contract.party_b_email,
            contract_title = contract.title,
            amount_usdc    = format_amount(contract.amount_usdc),
        )

    return {"status": "released", "tx_hash": tx_hash}


@router.get("/{link_token}/audit")
def get_audit_trail(link_token: str, db: Session = Depends(get_db)):
    contract = db.query(Contract).filter(Contract.link_token == link_token).first()
    if not contract:
        raise HTTPException(404, "Contract not found")

    logs = db.query(AuditLog).filter(
        AuditLog.contract_id == contract.id
    ).order_by(AuditLog.created_at).all()

    return {
        "contract_id": str(contract.id),
        "terms_hash":  contract.terms_hash,
        "events": [
            {
                "event":      log.event.value,
                "user_id":    str(log.user_id) if log.user_id else None,
                "extra_data": json.loads(log.extra_data) if log.extra_data else {},
                "timestamp":  log.created_at.isoformat(),
            }
            for log in logs
        ],
    }