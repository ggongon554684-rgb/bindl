from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.models import (
    Contract, Dispute, Reputation,
    ContractStatus, DisputeStatus, DisputeReason, AuditEvent
)
from app.services.audit import write_audit


def check_ghost_protection():
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()
        active = db.query(Contract).filter(
            Contract.status.in_([ContractStatus.LOCKED, ContractStatus.MILESTONE]),
            Contract.deadline < now,
            Contract.ghost_escalated == False,
        ).all()

        for contract in active:
            effective = contract.extended_deadline or contract.deadline
            hours_past = (now - effective).total_seconds() / 3600

            if hours_past >= 72 and not contract.ghost_escalated:
                _auto_escalate(db, contract)
            elif hours_past >= 48 and not contract.ghost_notified_48h:
                contract.ghost_notified_48h = True
                print(f"[Ghost] 48h warning: {contract.id}")
            elif hours_past >= 24 and not contract.ghost_notified_24h:
                contract.ghost_notified_24h = True
                print(f"[Ghost] 24h warning: {contract.id}")

        db.commit()
    except Exception as e:
        print(f"[Ghost Error] {e}")
        db.rollback()
    finally:
        db.close()


def _auto_escalate(db, contract):
    dispute = Dispute(
        contract_id    = contract.id,
        raised_by_id   = contract.party_a_id,
        reason         = DisputeReason.NO_DELIVERY,
        description    = "Auto-escalated by ghost protection — deadline passed with no response.",
        status         = DisputeStatus.OPEN,
        deposit_paid   = False,
        deposit_waived = True,
    )
    db.add(dispute)
    contract.status          = ContractStatus.DISPUTED
    contract.ghost_escalated = True

    if contract.party_b_id:
        rep = db.query(Reputation).filter(Reputation.user_id == contract.party_b_id).first()
        if rep:
            rep.ghosting_incidents += 1

    write_audit(db, contract.id, None, AuditEvent.GHOSTED,
                {"auto_escalated": True, "hours_past": "72+"})
    print(f"[Ghost] Auto-escalated: {contract.id}")


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(check_ghost_protection, "interval", hours=1,
                      id="ghost_protection", replace_existing=True)
    scheduler.start()
    print("[Scheduler] Ghost protection running — checks every hour")
    return scheduler
