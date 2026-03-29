#!/usr/bin/env python
"""Test complete contract workflow"""
import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000"

# Use a deadline 6 months in the future
future_deadline = (datetime.utcnow() + timedelta(days=180)).isoformat() + "Z"

def make_request(method, endpoint, data=None, headers=None, params=None):
    """Make HTTP request and return parsed JSON"""
    if headers is None:
        headers = {"Content-Type": "application/json"}
    
    url = f"{BASE_URL}{endpoint}"
    print(f"\n{'='*70}")
    print(f"{method} {endpoint}")
    if params:
        print(f"Query params: {params}")
    print(f"{'='*70}")
    
    try:
        if method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, params=params, timeout=10)
        elif method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params, timeout=10)
        else:
            raise ValueError(f"Unknown method: {method}")
        
        print(f"Status Code: {response.status_code}")
        try:
            result = response.json()
            print(f"Response: {json.dumps(result, indent=2, default=str)}")
            return result
        except:
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"ERROR: {e}")
        return None

# Test 1: Create a contract
print("\n" + "="*70)
print("TEST 1: Create Contract")
print("="*70)

create_data = {
    "party_a_wallet": "0x1234567890123456789012345678901234567890",
    "contract_type": "digital_service",
    "title": "Web Development Project",
    "description": "Build a website for TrustLink",
    "deliverables": ["index.html", "styles.css", "app.js", "documentation.md"],
    "acceptance_criteria": ["All pages responsive", "Mobile friendly", "Fast loading"],
    "deadline": future_deadline,
    "amount_usdc": 2000.00,
    "party_b_email": "developer@example.com",
    "party_a_name": "John Smith",
    "party_a_email": "john@example.com"
}

contract = make_request("POST", "/contracts/", create_data)
if not contract:
    print("ERROR: Could not create contract")
    exit(1)

link_token = contract.get("link_token")
contract_id = contract.get("id")
print(f"\nContract created: ID={contract_id}, Link Token={link_token}")

# Test 2: Party B agrees
print("\n" + "="*70)
print("TEST 2: Party B Agrees")
print("="*70)

agree_params = {
    "wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

agree_response = make_request("POST", f"/contracts/{link_token}/agree", params=agree_params)
if agree_response:
    status = agree_response.get("status")
    print(f"\nStatus after Party B agreed: {status}")
    if status == "ONGOING":
        print("SUCCESS: Contract transitioned to ONGOING")
    else:
        print(f"INFO: Expected ONGOING, got {status}")

# Test 3: Get contract details
print("\n" + "="*70)
print("TEST 3: Get Contract Details")
print("="*70)

details = make_request("GET", f"/contracts/{link_token}")
if details:
    print(f"\nContract Status: {details.get('status')}")
    print(f"Party A Agreed At: {details.get('party_a_agreed_at')}")
    print(f"Party B Agreed At: {details.get('party_b_agreed_at')}")

# Test 4: Party B submits work
print("\n" + "="*70)
print("TEST 4: Party B Submits Work")
print("="*70)

submit_data = {
    "wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

submit_response = make_request("POST", f"/contracts/{link_token}/submit-work", submit_data)
if submit_response:
    print(f"\nWork submitted successfully")

# Test 5: Party A approves work
print("\n" + "="*70)
print("TEST 5: Party A Approves Work")
print("="*70)

approve_data = {
    "wallet": "0x1234567890123456789012345678901234567890",
    "approved": True
}

approve_response = make_request("POST", f"/contracts/{link_token}/approve-work", approve_data)
if approve_response:
    print(f"\nWork approval response received")

# Test 6: Get final contract state
print("\n" + "="*70)
print("TEST 6: Final Contract State")
print("="*70)

final_details = make_request("GET", f"/contracts/{link_token}")
if final_details:
    print(f"\nFinal Contract Status: {final_details.get('status')}")
    print(f"Work Submitted At: {final_details.get('work_submitted_at')}")
    print(f"Work Submitted By: {final_details.get('work_submitted_by')}")
    print(f"Work Approved At: {final_details.get('work_approved_at')}")
    print(f"Work Approved By: {final_details.get('work_approved_by')}")

# Test 7: Lock the contract
print("\n" + "="*70)
print("TEST 7: Lock Contract")
print("="*70)

lock_data = {
    "party_b_wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "tx_hash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "escrow_id": "escrow_12345"
}

lock_response = make_request("POST", f"/contracts/{link_token}/lock", lock_data)
if lock_response:
    status = lock_response.get("status")
    print(f"\nStatus after lock: {status}")
    if status == "LOCKED":
        print("SUCCESS: Contract locked successfully")

print("\n" + "="*70)
print("WORKFLOW TEST COMPLETE")
print("="*70)

print("\n======================================================================")
print("TEST 8: Verify Status After Lock")
print("======================================================================")
get_after_lock = requests.get(f"http://localhost:8000/contracts/{link_token}")
print(f"Status after lock: {get_after_lock.json().get('status')}")
