#!/usr/bin/env python
"""Diagnose database status values"""
import sys
sys.path.insert(0, r'c:\Users\gabgab8608\Documents\acads\gab\bindl\bindlBackend')

from app.core.database import SessionLocal
from app.models.models import Contract

db = SessionLocal()
try:
    # Get the last contract
    contract = db.query(Contract).order_by(Contract.created_at.desc()).first()
    if contract:
        print(f"Contract ID: {contract.id}")
        print(f"Contract Status (raw): {repr(contract.status)}")
        print(f"Contract Status (type): {type(contract.status)}")
        print(f"Contract Status (str): {str(contract.status)}")
        
        # Check if it's an enum
        if hasattr(contract.status, 'value'):
            print(f"Contract Status (enum.value): {contract.status.value}")
        
        # Check all contracts
        print("\nAll contracts:")
        for c in db.query(Contract).all():
            print(f"  {c.id}: status={repr(c.status)} type={type(c.status).__name__}")
    else:
        print("No contracts found")
finally:
    db.close()
