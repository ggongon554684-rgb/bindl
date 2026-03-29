"""
Run with: pytest tests/ -v
Make sure your server is running and .env is configured before running.
These are integration tests that hit a real running server.

Optional: RUN_GEMINI_INTEGRATION=1 enables test_ai_scope (needs Gemini API quota).
"""
import os
from datetime import datetime, timedelta

import httpx
import pytest

BASE_URL = "http://localhost:8000"
TEST_WALLET_A = "0x1111111111111111111111111111111111111111"
TEST_WALLET_B = "0x2222222222222222222222222222222222222222"


@pytest.fixture
def client():
    return httpx.Client(base_url=BASE_URL, timeout=30)


def _create_contract_payload():
    return {
        "party_a_wallet": TEST_WALLET_A,
        "contract_type": "digital_service",
        "title": "Logo design for TrustLink",
        "description": "Design a modern logo for the TrustLink app",
        "deliverables": ["PNG file 1000x1000px", "SVG vector file", "Dark and light variants"],
        "acceptance_criteria": ["Logo uses brand colors", "Delivered in specified formats"],
        "revision_count": 2,
        "deadline": (datetime.utcnow() + timedelta(days=7)).isoformat(),
        "amount_usdc": 50.0,
        "amount_php": 2800.0,
    }


def create_contract_link_token(client: httpx.Client) -> str:
    """POST /contracts/ and return link_token for dependent tests."""
    r = client.post("/contracts/", json=_create_contract_payload())
    assert r.status_code == 201
    data = r.json()
    assert "link_token" in data
    return data["link_token"]


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    print(f"✓ Health: {data}")


def test_create_contract(client):
    r = client.post("/contracts/", json=_create_contract_payload())
    assert r.status_code == 201
    data = r.json()
    assert "link_token" in data
    assert "pay_url" in data
    print(f"✓ Contract created: {data['pay_url']}")


def test_get_contract_by_link(client):
    token = create_contract_link_token(client)
    r = client.get(f"/contracts/{token}")
    assert r.status_code == 200
    data = r.json()
    # API maps internal draft → STATUS_MAP "CREATED"
    assert data["status"] == "CREATED"
    assert len(data["deliverables"]) == 3
    print(f"✓ Contract fetched: {data['title']}")


def test_party_b_agree(client):
    token = create_contract_link_token(client)
    r = client.post(f"/contracts/{token}/agree", params={
        "wallet": TEST_WALLET_B,
        "device_id": "test-device-001"
    })
    assert r.status_code == 200
    assert r.json()["agreed"] is True
    print(f"✓ Party B agreed, terms hash: {r.json()['terms_hash']}")


def test_reputation_new_user(client):
    r = client.get(f"/users/0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef/reputation")
    assert r.status_code == 200
    data = r.json()
    assert data["is_new"] is True
    assert "New account" in data["signal_tags"]
    print(f"✓ New user reputation: {data}")


@pytest.mark.skipif(
    os.environ.get("RUN_GEMINI_INTEGRATION", "").lower() not in ("1", "true", "yes"),
    reason="Set RUN_GEMINI_INTEGRATION=1 to run (requires Gemini API quota).",
)
def test_ai_scope(client):
    r = client.post("/ai/scope", json={
        "raw_description": "I need someone to build me a landing page for my coffee shop. It should look nice and modern.",
        "contract_type": "digital_service"
    })
    assert r.status_code == 200
    data = r.json()
    assert len(data["deliverables"]) > 0
    assert len(data["warnings"]) >= 0
    print(f"✓ AI scope: {data['title']}")
    print(f"  Deliverables: {data['deliverables']}")
    print(f"  Warnings: {data['warnings']}")


def test_audit_trail(client):
    token = create_contract_link_token(client)
    # Party B opens and agrees
    client.get(f"/contracts/{token}")
    client.post(f"/contracts/{token}/agree", params={"wallet": TEST_WALLET_B})

    r = client.get(f"/contracts/{token}/audit")
    assert r.status_code == 200
    data = r.json()
    events = [e["event"] for e in data["events"]]
    assert "party_agreed" in events  # Party A agreed at creation
    assert "link_opened" in events
    print(f"✓ Audit trail: {events}")
