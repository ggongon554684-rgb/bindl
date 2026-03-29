import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean,
    DateTime, ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


class ContractType(str, enum.Enum):
    DIGITAL_SERVICE = "digital_service"
    PHYSICAL_GOODS  = "physical_goods"
    IN_PERSON       = "in_person"
    RENTAL          = "rental"


class ContractStatus(str, enum.Enum):
    DRAFT      = "draft"
    ONGOING    = "ongoing"
    LOCKED     = "locked"
    MILESTONE  = "milestone"
    RELEASED   = "released"
    DISPUTED   = "disputed"
    CANCELLED  = "cancelled"
    EXPIRED    = "expired"


class DisputeReason(str, enum.Enum):
    BAD_MATCH    = "bad_match"
    QUALITY      = "quality"
    LOST_TRANSIT = "lost_transit"
    NO_DELIVERY  = "no_delivery"
    OTHER        = "other"


class DisputeStatus(str, enum.Enum):
    OPEN        = "open"
    NEGOTIATING = "negotiating"
    PEER_REVIEW = "peer_review"
    RESOLVED    = "resolved"


class AmendmentStatus(str, enum.Enum):
    PENDING  = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED  = "expired"


class AuditEvent(str, enum.Enum):
    LINK_OPENED      = "link_opened"
    TERMS_VIEWED     = "terms_viewed"
    PARTY_AGREED     = "party_agreed"
    FUNDS_LOCKED     = "funds_locked"
    WORK_SUBMITTED   = "work_submitted"
    FINAL_SUBMITTED  = "final_submitted"
    APPROVED         = "approved"
    DISPUTED         = "disputed"
    RELEASED         = "released"
    AMENDED          = "amended"
    GHOSTED          = "ghosted"


class User(Base):
    __tablename__ = "users"

    id             = Column(String(36), primary_key=True, default=new_uuid)
    wallet_address = Column(String(42), unique=True, nullable=False, index=True)
    phone_number   = Column(String(20), unique=True, nullable=True)
    email          = Column(String(255), unique=True, nullable=True)
    display_name   = Column(String(100), nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contracts_as_party_a = relationship("Contract", foreign_keys="Contract.party_a_id", back_populates="party_a")
    contracts_as_party_b = relationship("Contract", foreign_keys="Contract.party_b_id", back_populates="party_b")
    reputation           = relationship("Reputation", back_populates="user", uselist=False)
    audit_logs           = relationship("AuditLog", back_populates="user")


class Contract(Base):
    __tablename__ = "contracts"

    id              = Column(String(36), primary_key=True, default=new_uuid)
    link_token      = Column(String(64), unique=True, nullable=False, index=True)
    contract_type   = Column(SAEnum(ContractType), nullable=False)
    status          = Column(String(50), default=ContractStatus.DRAFT.value, nullable=False)

    party_a_id      = Column(String(36), ForeignKey("users.id"), nullable=False)
    party_b_id      = Column(String(36), ForeignKey("users.id"), nullable=True)
    party_b_email   = Column(String(255), nullable=True)

    # ✅ NEW: Track when each party agreed
    party_a_agreed_at = Column(DateTime, nullable=True)
    party_b_agreed_at = Column(DateTime, nullable=True)

    # ✅ NEW: Track work submission and approval
    work_submitted_at = Column(DateTime, nullable=True)
    work_submitted_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    work_approved_at  = Column(DateTime, nullable=True)
    work_approved_by  = Column(String(36), ForeignKey("users.id"), nullable=True)
    final_submitted_at = Column(DateTime, nullable=True)

    title               = Column(String(255), nullable=False)
    description         = Column(Text, nullable=False)
    deliverables        = Column(Text, nullable=False)
    acceptance_criteria = Column(Text, nullable=True)
    revision_count      = Column(Integer, default=0)
    deadline            = Column(DateTime, nullable=False)

    amount_usdc      = Column(Float, nullable=False)
    amount_php       = Column(Float, nullable=True)
    fee_bps          = Column(Integer, default=200)

    escrow_id        = Column(String(66), nullable=True)
    tx_hash_lock     = Column(String(66), nullable=True)
    tx_hash_release  = Column(String(66), nullable=True)
    terms_hash       = Column(String(66), nullable=True)

    ghost_notified_24h = Column(Boolean, default=False)
    ghost_notified_48h = Column(Boolean, default=False)
    ghost_escalated    = Column(Boolean, default=False)

    extended           = Column(Boolean, default=False)
    extended_deadline  = Column(DateTime, nullable=True)

    tracking_number    = Column(String(100), nullable=True)
    tracking_carrier   = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    party_a    = relationship("User", foreign_keys=[party_a_id], back_populates="contracts_as_party_a")
    party_b    = relationship("User", foreign_keys=[party_b_id], back_populates="contracts_as_party_b")
    milestones = relationship("Milestone", back_populates="contract")
    disputes   = relationship("Dispute", back_populates="contract")
    amendments = relationship("Amendment", back_populates="contract")
    audit_logs = relationship("AuditLog", back_populates="contract")


class Milestone(Base):
    __tablename__ = "milestones"

    id          = Column(String(36), primary_key=True, default=new_uuid)
    contract_id = Column(String(36), ForeignKey("contracts.id"), nullable=False)
    index       = Column(Integer, nullable=False)
    title       = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    amount_usdc = Column(Float, nullable=False)
    released    = Column(Boolean, default=False)
    released_at = Column(DateTime, nullable=True)
    tx_hash     = Column(String(66), nullable=True)

    contract = relationship("Contract", back_populates="milestones")


class Dispute(Base):
    __tablename__ = "disputes"

    id             = Column(String(36), primary_key=True, default=new_uuid)
    contract_id    = Column(String(36), ForeignKey("contracts.id"), nullable=False)
    raised_by_id   = Column(String(36), ForeignKey("users.id"), nullable=False)
    reason         = Column(SAEnum(DisputeReason), nullable=False)
    description    = Column(Text, nullable=False)
    evidence_urls  = Column(Text, nullable=True)
    status         = Column(SAEnum(DisputeStatus), default=DisputeStatus.OPEN)
    deposit_paid   = Column(Boolean, default=False)
    deposit_waived = Column(Boolean, default=False)
    resolution     = Column(String(20), nullable=True)
    resolved_at    = Column(DateTime, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    contract  = relationship("Contract", back_populates="disputes")
    raised_by = relationship("User", foreign_keys=[raised_by_id])


class Amendment(Base):
    __tablename__ = "amendments"

    id                 = Column(String(36), primary_key=True, default=new_uuid)
    contract_id        = Column(String(36), ForeignKey("contracts.id"), nullable=False)
    proposed_by_id     = Column(String(36), ForeignKey("users.id"), nullable=False)
    status             = Column(SAEnum(AmendmentStatus), default=AmendmentStatus.PENDING)
    new_amount_usdc    = Column(Float, nullable=True)
    new_deadline       = Column(DateTime, nullable=True)
    new_deliverables   = Column(Text, nullable=True)
    new_revision_count = Column(Integer, nullable=True)
    reason             = Column(Text, nullable=False)
    expires_at         = Column(DateTime, nullable=False)
    created_at         = Column(DateTime, default=datetime.utcnow)
    responded_at       = Column(DateTime, nullable=True)

    contract    = relationship("Contract", back_populates="amendments")
    proposed_by = relationship("User", foreign_keys=[proposed_by_id])


class AuditLog(Base):
    __tablename__ = "audit_log"

    id          = Column(String(36), primary_key=True, default=new_uuid)
    contract_id = Column(String(36), ForeignKey("contracts.id"), nullable=False)
    user_id     = Column(String(36), ForeignKey("users.id"), nullable=True)
    event       = Column(SAEnum(AuditEvent), nullable=False)
    extra_data  = Column(Text, nullable=True)   # renamed from metadata — reserved word in SQLAlchemy
    ip_address  = Column(String(45), nullable=True)
    device_id   = Column(String(100), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    contract = relationship("Contract", back_populates="audit_logs")
    user     = relationship("User", back_populates="audit_logs")


class Reputation(Base):
    __tablename__ = "reputation"

    id                  = Column(String(36), primary_key=True, default=new_uuid)
    user_id             = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    score               = Column(Float, default=0.0)
    total_contracts     = Column(Integer, default=0)
    completed_contracts = Column(Integer, default=0)
    disputes_raised     = Column(Integer, default=0)
    disputes_won        = Column(Integer, default=0)
    disputes_lost       = Column(Integer, default=0)
    ghosting_incidents  = Column(Integer, default=0)
    avg_response_hours  = Column(Float, nullable=True)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="reputation")
