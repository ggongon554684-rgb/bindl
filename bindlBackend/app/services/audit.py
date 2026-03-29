import json
from typing import Optional
from sqlalchemy.orm import Session
from app.models.models import AuditLog, AuditEvent


def write_audit(
    db: Session,
    contract_id,
    user_id,
    event: AuditEvent,
    extra_data: Optional[dict] = None,
    ip_address: Optional[str] = None,
    device_id: Optional[str] = None,
):
    log = AuditLog(
        contract_id = contract_id,
        user_id     = user_id,
        event       = event,
        extra_data  = json.dumps(extra_data) if extra_data else None,
        ip_address  = ip_address,
        device_id   = device_id,
    )
    db.add(log)
