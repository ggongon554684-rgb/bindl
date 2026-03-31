#!/usr/bin/env python
"""Debug script to check contract status values directly"""
import requests
import json

# First create a contract
create_response = requests.post(
    "http://localhost:8000/contracts/",
    json={
        "party_a_wallet": "0x1111111111111111111111111111111111111111",
        "contract_type": "digital_service",
        "title": "Debug Test",
        "description": "Debug test contract",
        "deliverables": ["test.txt"],
        "deadline": "2026-09-25T05:21:29Z",
        "amount_usdc": 100,
    }
)

print("CREATE response status:", create_response.status_code)
contract_data = create_response.json()
link_token = contract_data.get("link_token")
print(f"Contract created: {link_token}")
print(f"Created status: {contract_data.get('status')}")

# Then get the contract
print("\n--- Getting contract before agree ---")
get_response = requests.get(f"http://localhost:8000/contracts/{link_token}")
contract = get_response.json()
print(f"GET response status: {get_response.status_code}")
print(f"Contract status field: '{contract.get('status')}'")
print(f"Full status data: {repr(contract.get('status'))}")

# Then have party B agree
print("\n--- Having party B agree ---")
agree_response = requests.post(
    f"http://localhost:8000/contracts/{link_token}/agree",
    params={"wallet": "0x2222222222222222222222222222222222222222"}
)
print(f"AGREE response status: {agree_response.status_code}")
agree_data = agree_response.json()
print(f"Agree response status: '{agree_data.get('status')}'")
print(f"Agree response status (repr): {repr(agree_data.get('status'))}")

# Get contract again
print("\n--- Getting contract after agree ---")
get_response2 = requests.get(f"http://localhost:8000/contracts/{link_token}")
contract2 = get_response2.json()
print(f"GET response status: {get_response2.status_code}")
print(f"Contract status field: '{contract2.get('status')}'")
print(f"Full response:")
print(json.dumps(contract2, indent=2, default=str))
    