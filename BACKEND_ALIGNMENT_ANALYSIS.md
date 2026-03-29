# Backend Alignment Analysis & Fix Documentation

**Bindl TrustLink System - Frontend to Backend Alignment Review**  
**Updated**: 2026-03-24

---

## Executive Summary

Your backend has **14 API endpoints** and **7 database models** with most core functionality implemented. However, there are **3 critical errors**, **9+ missing endpoints**, and several **data structure alignment issues** that will prevent the frontend from working correctly.

**Status**:

- ✅ 11/14 endpoints complete
- ❌ 3+ critical errors found
- ⚠️ 9+ missing features required by frontend
- ❌ 1 import error blocking deployment

---

## Part 1: Critical Errors (Must Fix Immediately)

### ❌ Error #1: Import Path Error in `contracts.py`

**Location**: [app/routes/contracts.py](app/routes/contracts.py) Line 14

**Current Code (WRONG)**:

```python
from app.core.services.validators import (
    validate_ethereum_address, validate_contract_amount, validate_deadline,
    validate_parties_differ, validate_milestone_amounts
)
```

**Problem**:

- The path `app.core.services.validators` does NOT exist
- Validators are defined in `app/validators.py`, not in core/services
- This will cause an **ImportError** when the app starts, preventing all contract routes from loading

**Fix**:

```python
from app.validators import (
    validate_ethereum_address, validate_contract_amount, validate_deadline,
    validate_parties_differ, validate_milestone_amounts
)
```

**Impact**: 🔴 **CRITICAL** - Blocks entire contracts API (POST/GET/POST lock/POST release)

---

### ❌ Error #2: Route Ordering Conflict in `contracts.py`

**Location**: [app/routes/contracts.py](app/routes/contracts.py) - Route definition order

**Problem**:

- Route `@router.get("/contracts/by-wallet")` will be shadowed by `@router.get("/contracts/{link_token}")`
- FastAPI matches routes in order; `by-wallet` must be defined BEFORE `{link_token}`
- Currently, any call to `/contracts/by-wallet?address=0x...` will be interpreted as looking for a contract with `link_token="by-wallet"`

**Expected by Frontend**:

```
GET /contracts?address={walletAddress}  ← Frontend calls this
```

**Backend Implementation**:

```python
@router.get("/by-wallet")  ← But route is under /contracts prefix, so becomes /contracts/by-wallet
```

**Fix**: Move the `by-wallet` route definition to appear BEFORE the `{link_token}` route in the file.

**Impact**: 🔴 **CRITICAL** - `/contracts?address=` endpoint will fail, breaking dashboard contract list

---

### ❌ Error #3: Missing Party B Wallet/Email in Contract Creation

**Frontend Sends** (from form):

```json
{
  "title": "string",
  "description": "string",
  "deliverables": "string",
  "deadline": "ISO-8601 date",
  "amount": "USDC amount",
  "partyBEmail": "party.b@example.com",  ← Email to identify party B
  "contractType": "digital"
}
```

**Backend Expects** (likely POST /contracts):

```json
{
  "party_a_id": "UUID",
  "party_b_id": "UUID",  ← Backend expects already-existing user
  "title": "string",
  ...
}
```

**Problem**:

- Frontend sends `party_b_email` (just a string)
- Backend expects `party_b_id` (a UUID of an existing user)
- **How do we match the email to a user ID?** No lookup endpoint exists
- Or: Should we allow Party B to be created on-the-fly from email?

**Impact**: 🔴 **CRITICAL** - Contract creation will fail or create contracts with no Party B

---

## Part 2: Frontend vs Backend API Alignment

### Required Endpoints (Frontend Expectations)

| #   | Frontend Expects                                    | Backend Has                              | Status    | Issue              |
| --- | --------------------------------------------------- | ---------------------------------------- | --------- | ------------------ |
| 1   | `GET /contracts?address={wallet}`                   | `GET /contracts/by-wallet`               | ✅ Exists | Route ordering bug |
| 2   | `GET /contracts/{id}`                               | `GET /contracts/{link_token}`            | ✅ Exists | ✅ Correct         |
| 3   | `POST /contracts/{linkToken}/agree?wallet={wallet}` | `POST /contracts/{link_token}/agree`     | ✅ Exists | ✅ Correct         |
| 4   | `POST /ai/scope`                                    | `POST /ai/scope`                         | ✅ Exists | ✅ Correct         |
| 5   | `POST /ai/reputation-summary`                       | `POST /ai/reputation-summary`            | ✅ Exists | ✅ Correct         |
| 6   | `GET /users/{address}/reputation`                   | `GET /users/{wallet_address}/reputation` | ✅ Exists | ✅ Correct         |

**All major endpoints exist!** But hidden issues in implementation...

---

## Part 3: Data Structure Alignment Issues

### Model #1: Contract Response

**Frontend Expects** (from ReputationCard, ContractCard, etc.):

```javascript
{
  contract_id: "BDL-001",          // Display ID
  link_token: "abc123token",       // Share link token
  type: "digital",                 // digital|goods|inperson|rental
  title: "Website Redesign",
  description: "...",
  deliverables: "...",
  deadline: "2026-04-15T00:00:00Z", // ISO date
  amount_usdc: "5000",              // String format, 6 decimals
  party_a: "John Smith",            // Display name
  party_a_wallet: "0x123...",
  party_b: "Jane Doe",              // Can be null
  party_b_wallet: "0x456...",       // Can be null
  party_b_email: "jane@example.com", // Can be null
  status: "LOCKED",                 // PENDING|LOCKED|RELEASED|DISPUTED|CREATED|ACTIVE|COMPLETE
  created_at: "2026-03-20T12:00:00Z",
  terms_hash: "0xabcd...?",
}
```

**Backend Likely Returns** (based on models):

```python
{
  id: "UUID",                    # ❌ Wrong - frontend expects contract_id as string like "BDL-001"
  link_token: "...",             # ✅
  contract_type: "DIGITAL_SERVICE",  # ❌ Backend uses enums, frontend expects lowercase
  status: "LOCKED",              # ✅ (if mapped correctly)
  party_a_id: "UUID",            # ❌ Frontend wants display name + wallet, not ID
  party_b_id: "UUID",
  title: "...",                  # ✅
  description: "...",            # ✅
  deliverables: {...},           # ✅ (likely JSON)
  deadline: "...",               # ✅
  amount_usdc: 5000,             # ❌ Frontend expects string "5000"
  amount_php: 275000,
  fee_bps: 200,
  created_at: "...",             # ✅
  # Missing from frontend expectations:
  revision_count, tracking_number, ghost_notified_24h, etc.
}
```

**Alignment Issues**:

- ❌ `id` vs `contract_id` - Need contract_id field (like "BDL-001") instead of UUID
- ❌ `contract_type: DIGITAL_SERVICE` vs `type: "digital"` - Enum vs lowercase string
- ❌ `party_a_id` is UUID, frontend wants `party_a` (name) + `party_a_wallet` (address)
- ❌ `amount_usdc` returned as number, frontend expects string
- ⚠️ Extra fields like `amount_php`, `fee_bps` not used by frontend but OK to include

**Fix Strategy**:

1. Add `contract_id` generation logic (e.g., "BDL-" + first 6 chars of UUID)
2. Convert enum contract_type to lowercase in response
3. Join Contract with User table to return display names instead of IDs
4. Convert amount_usdc to string in response

---

### Model #2: Reputation Data Response

**Frontend Expects**:

```javascript
{
  address: "0x123...",
  score: 4.2,                          // float 1.0-5.0
  total_contracts: 18,
  completed: 16,
  disputes_won: 1,
  disputes_lost: 0,
  ghosting_incidents: 1,
  signal_tags: ["Fast delivery", "Reliable"],  // AI-generated tags
  ai_summary: "Reliable seller...",    // From AI endpoint
}
```

**Backend Model** (likely):

```python
{
  user_id: "UUID",               # ❌ Wrong
  address: "0x123...",           # ✅
  score: 4.2,                    # ✅
  total_contracts: 18,           # ✅
  completed_contracts: 16,       # ⚠️ Field name differs
  disputes_raised: ...,          # ❌ Frontend expects disputes_won/lost, not raised
  disputes_won: 1,               # ✅
  disputes_lost: 0,              # ✅
  ghosting_incidents: 1,         # ✅
  avg_response_hours: 2.5,       # ❌ Not used by frontend (OK to keep)
  # Missing:
  signal_tags: [],               # ❌ Missing - needs to be generated
  ai_summary: "",                # ❌ Missing or separate endpoint?
}
```

**Alignment Issues**:

- ❌ `completed` field is `completed_contracts` in backend
- ❌ `signal_tags` not in model - needs to be generated from reputation data
- ⚠️ `ai_summary` - Is this stored in Reputation, or fetched from AI endpoint?

**Fix Strategy**:

1. Rename `completed_contracts` → `completed` in response
2. Add `signal_tags` generation logic (derive from disputes, ghosting, etc.)
3. Clarify if `ai_summary` is cached or computed on each request

---

### Model #3: Contract Status Mapping

**Frontend Status Values** (from status badge styling):

```
PENDING   → yellow
LOCKED    → blue
RELEASED  → green
DISPUTED  → red
CREATED   → yellow
ACTIVE    → blue
COMPLETE  → green
```

**Backend Status Values** (from models):

```
DRAFT
LOCKED
MILESTONE    ← Not in frontend list!
RELEASED
DISPUTED
CANCELLED    ← Not in frontend list!
EXPIRED      ← Not in frontend list!
```

**Alignment Issues**:

- ❌ Frontend expects `PENDING` or `CREATED` for initial draft state, backend uses `DRAFT`
- ❌ Backend uses `MILESTONE` for milestone-based contracts, frontend doesn't reference this
- ❌ Frontend expects `ACTIVE` status (what triggers this?), backend has `LOCKED`
- ❌ Frontend expects `COMPLETE`, backend uses `RELEASED`
- ⚠️ Extra backend statuses (`CANCELLED`, `EXPIRED`) not handled by frontend

**Fix Strategy**:

1. Create a status translation layer that converts backend enums to frontend strings
2. Map: `DRAFT → CREATED/PENDING`, `LOCKED → ACTIVE`, `RELEASED → COMPLETE`
3. Decide: What triggers transition from CREATED to PENDING?

---

### Model #4: Contract Type Mapping

**Frontend Types**:

```
"digital" → Freelance, design, dev, writing
"goods" → Products, merchandise, shipping
"inperson" → Events, tutoring, consulting
"rental" → Property, equipment, vehicles
```

**Backend Types** (enum):

```
DIGITAL_SERVICE
PHYSICAL_GOODS
IN_PERSON
RENTAL
```

**Alignment Issues**:

- ❌ Backend uses `DIGITAL_SERVICE`, frontend expects `"digital"` (lowercase string)
- ❌ Backend uses `PHYSICAL_GOODS`, frontend expects `"goods"`
- ✅ `IN_PERSON` vs `"inperson"` - can map
- ✅ `RENTAL` vs `"rental"` - exact match

**Fix Strategy**: Add enum-to-string conversion in serializer:

```python
TYPE_MAPPING = {
    ContractType.DIGITAL_SERVICE: "digital",
    ContractType.PHYSICAL_GOODS: "goods",
    ContractType.IN_PERSON: "inperson",
    ContractType.RENTAL: "rental",
}
```

---

## Part 4: Missing Endpoints Required by Frontend

### Missing Feature #1: Contract Listing by Wallet

**Frontend Needs**: `GET /contracts?address={walletAddress}`

**Backend Has**: `GET /contracts/by-wallet` (with route ordering bug)

**Issues**:

1. Route defined as `by-wallet`, not query parameter `?address=`
2. Route ordering bug will make it inaccessible
3. Response format needs verification

**Fix**:

```python
@router.get("/")  # Not /by-wallet
async def list_contracts(address: str = Query(...), db: Session = Depends(get_db)):
    # Get contracts where party_a or party_b matches address
    pass
```

---

### Missing Feature #2: Reputation Summary with AI

**Frontend Calls**: `POST /ai/reputation-summary` with `{ address: "0x..." }`

**Backend Has**: ✅ Endpoint exists

**Issue**: Response format unclear

- Does it return just the summary text?
- Or full Reputation object + AI summary?

**Expected Response**:

```javascript
{
  address: "0x123...",
  score: 4.2,
  total_contracts: 18,
  completed: 16,
  disputes_won: 1,
  disputes_lost: 0,
  ghosting_incidents: 1,
  signal_tags: ["Fast delivery", "Reliable"],
  ai_summary: "This user..."  ← AI-generated text
}
```

**Fix**: Verify endpoint returns full Reputation object, not just summary

---

### Missing Feature #3: Dispute Details Endpoint

**Frontend Needs**: No direct dispute endpoint called, but may need to fetch dispute details

**Backend Missing**: `GET /disputes/{dispute_id}`

**What's Needed**:

```python
@router.get("/{dispute_id}")
async def get_dispute(dispute_id: str, db: Session = Depends(get_db)):
    return {
        id: dispute_id,
        contract_id: "...",
        raised_by: "0x...",
        reason: "BAD_MATCH",
        description: "...",
        evidence_urls: [],
        status: "OPEN",
        created_at: "...",
    }
```

**Impact**: 🟡 Medium - Needed for dispute details page (if it exists)

---

### Missing Feature #4: Evidence Upload (Disputes)

**Frontend Needs**: No explicit evidence upload, but Dispute form mentions "evidence URLs"

**Backend Missing**: Endpoint to attach/list evidence files

**What's Needed**:

```python
@router.post("/{dispute_id}/evidence")
async def add_evidence(evidence_url: str, file: UploadFile):
    # Store file and add URL to dispute.evidence_urls
    pass
```

**Impact**: 🟡 Medium - Needed if disputes require evidence submission

---

### Missing Feature #5: Dispute Resolution Endpoint

**Frontend Behavior**: Unknown (no dispute resolution UI visible in analysis)

**Backend Missing**: `POST /disputes/{dispute_id}/resolve`

**What's Needed**:

```python
@router.post("/{dispute_id}/resolve")
async def resolve_dispute(
    dispute_id: str,
    resolution: str,  # Who won?
    db: Session = Depends(get_db)
):
    # Update dispute status, fund release path
    pass
```

**Impact**: 🔴 Critical - Core feature, likely needed

---

### Missing Feature #6: List Amendments

**Frontend Needs**: No explicit endpoint, but amendments are part of contract lifecycle

**Backend Missing**: `GET /amendments/?contract_id={id}`

**What's Needed**:

```python
@router.get("/")
async def list_amendments(contract_id: str, db: Session = Depends(get_db)):
    return amendments for this contract
```

**Impact**: 🟡 Medium - Needed if frontend shows amendment history

---

## Part 5: Configuration & Environment Issues

### Required Environment Variables

**Frontend Environment Variables** (NEXT.js):

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ESCROW_ADDRESS=0x...
NEXT_PUBLIC_MOCK_USDC_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=1337
```

**Backend Environment Variables** (must support these):

```
DATABASE_URL=mysql://user:pass@localhost/trustlink
SECRET_KEY=your-secret-key
APP_ENV=development
FRONTEND_URL=http://localhost:3000  ← CORS origin
BASE_RPC_URL=http://127.0.0.1:7545  ← Ganache or Base Sepolia RPC
CHAIN_ID=1337
CONTRACT_ADDRESS=0x...  ← Deployed escrow contract
SIGNER_PRIVATE_KEY=0x...  ← Service account for releasing funds
GEMINI_API_KEY=your-api-key
PROTOCOL_FEE_BPS=200
FEE_RECIPIENT=0x...
```

**Alignment Issue**:

- ✅ Backend has all required config
- ⚠️ CORS must allow NEXT_PUBLIC_API_URL (default http://localhost:3000)
- ⚠️ Smart contract interactions must be mocked or deployed to match chain ID

---

## Part 6: Smart Contract Integration Issues

### Expected Function Calls from Frontend

**From pay/[id]/page.tsx**:

**1. USDC Approval**:

```javascript
approve(ESCROW_ADDRESS, amountInUnits); // USDC contract
```

**2. Lock Funds**:

```javascript
lockFunds(contract.link_token); // Escrow contract
```

**3. Release Funds**:

```javascript
releaseFunds(contract.link_token); // Escrow contract (backend may do this)
```

**4. Raise Dispute**:

```javascript
raiseDispute(contract.link_token); // Escrow contract
```

**Backend Issues**:

- ❌ No validation that smart contract match frontend's expected ABI
- ❌ No test that escrow contract is deployed and callable
- ⚠️ Ghost protection scheduler might release funds automatically (frontend doesn't expect this)

**Fix Strategy**:

1. Verify escrow contract ABI matches expectations
2. Ensure `lockFunds`, `releaseFunds`, `raiseDispute` exist
3. Document auto-release behavior if it exists

---

## Part 7: Prioritized Fix Checklist

### 🔴 CRITICAL (Deploy-blocking) - Fix First

- [ ] **Fix Import Error** - Change `app.core.services.validators` → `app.validators` in contracts.py
- [ ] **Fix Route Ordering** - Move `/by-wallet` before `/{link_token}` route
- [ ] **Fix Party B Creation Logic** - Handle party_b_email → user lookup or creation
- [ ] **Add contract_id Field** - Generate "BDL-" + UUID shorthand for display
- [ ] **Add Type Conversion Layer** - Map enum types to lowercase strings
- [ ] **Add User Join in Contract Response** - Return party_a and party_b as {name, wallet}
- [ ] **String Amount Format** - Convert amount_usdc to string "5000" not 5000

### 🟡 IMPORTANT (Feature-blocking) - Fix Second

- [ ] **Add `GET /disputes/{dispute_id}`** - Fetch single dispute
- [ ] **Add `POST /disputes/{dispute_id}/resolve`** - Resolve dispute
- [ ] **Add `GET /amendments/?contract_id=`** - List amendments
- [ ] **Verify AI Response Format** - Ensure /ai/reputation-summary returns full Reputation object
- [ ] **Add Status Mapping** - DRAFT→CREATED, LOCKED→ACTIVE, RELEASED→COMPLETE
- [ ] **Add signal_tags Generation** - Derive from reputation stats

### 🟢 NICE-TO-HAVE (Polish) - Fix Third

- [ ] Add `POST /amendments/{amendment_id}/evidence`
- [ ] Add `PUT /users/{wallet}`
- [ ] Add pagination to list endpoints
- [ ] Add request/response validation schemas

---

## Part 8: Data Flow Validation

### Flow #1: Dashboard Contract List

**Frontend Flow**:

```
1. useSession() → Get user email/name
2. useAccount() → Get wallet address
3. GET /contracts?address={wallet} ← NEEDS FIX (route ordering)
4. Render Contract cards with:
   - contract.status → Status badge
   - contract.type → Icon
   - contract.amount_usdc → "5000 USDC"
   - contract.deadline → "Due Apr 15"
```

**Backend Issues**:

- ❌ /contracts/by-wallet route not callable due to ordering
- ❌ Response missing contract_id, has UUID instead
- ❌ amount_usdc returned as number not string

---

### Flow #2: Create Contract

**Frontend Flow**:

```
1. Choose type (digital/goods/inperson/rental)
2. Form fills: title, description, deliverables, deadline, amount, partyBEmail
3. Optional: POST /ai/scope for AI pre-fill
4. POST /contracts/ with form data
5. Get back: contract_id, link_token
6. Share link to party B
```

**Backend Issues**:

- ❌ Party B creation from email not documented
- ❌ Unclear how backend creates contract without party_b_id
- ⚠️ Unclear if contract starts in DRAFT or CREATED status

---

### Flow #3: Review & Lock Funds

**Frontend Flow**:

```
1. Open shared link: /pay/{link_token}
2. GET /contracts/{link_token}
3. Display contract details
4. User scrolls to bottom (unlock action buttons)
5. POST /contracts/{link_token}/agree?wallet={address}
6. User approves USDC (smart contract call)
7. User calls escrow.lockFunds() (smart contract call)
8. Backend listens for tx_hash_lock, updates status → LOCKED
```

**Backend Issues**:

- ❌ How does backend detect lockFunds call to update status?
- ❌ No webhook for smart contract events
- ⚠️ Status might not update in real-time

---

### Flow #4: AI Features

**Frontend Flow**:

```
1. POST /ai/scope with: { description: "natural language request" }
2. Get back: { title, description, deliverables, deadline, amount }
3. POST /ai/reputation-summary with: { address: "0x..." }
4. Get back: Reputation object with ai_summary field
```

**Backend Issues**:

- ⚠️ Verify /ai/scope returns all 5 fields
- ⚠️ Verify /ai/reputation-summary returns full object not just summary

---

## Part 9: Implementation Priority Matrix

| Issue                            | Severity | Effort | Impact                   | Priority |
| -------------------------------- | -------- | ------ | ------------------------ | -------- |
| Import error in contracts.py     | Critical | 5 min  | Blocks all contracts     | **P0**   |
| Route ordering conflict          | Critical | 5 min  | Breaks contract list     | **P0**   |
| Party B creation logic           | Critical | 30 min | Blocks contract creation | **P0**   |
| contract_id field generation     | High     | 15 min | UX - display IDs         | **P1**   |
| Type/status enum conversion      | High     | 20 min | Data alignment           | **P1**   |
| User lookup in Contract response | High     | 20 min | Data structure           | **P1**   |
| GET /disputes/{id} endpoint      | High     | 20 min | Feature completeness     | **P1**   |
| POST /disputes/{id}/resolve      | High     | 30 min | Core feature             | **P1**   |
| Signal tags generation           | Medium   | 20 min | Reputation display       | **P2**   |
| Evidence upload endpoint         | Medium   | 30 min | Dispute features         | **P2**   |

---

## Part 10: Testing Checklist

Before deploying, verify:

- [ ] Import error fixed → app starts without ImportError
- [ ] `GET /contracts?address=0x...` returns list of contracts
- [ ] Contract response includes: contract_id, link_token, type (lowercase), amount_usdc (string), party_a/party_b objects
- [ ] `POST /contracts/` creates contract with party_b_email → finds/creates user
- [ ] Contract status mapping: DRAFT→CREATED, LOCKED→ACTIVE, RELEASED→COMPLETE
- [ ] `GET /users/{address}/reputation` returns object with signal_tags array
- [ ] `POST /ai/reputation-summary` returns full Reputation + ai_summary
- [ ] `GET /disputes/{dispute_id}` returns dispute details
- [ ] `POST /contracts/{link_token}/agree` works with party_b wallet address
- [ ] Smart contract addresses match frontend NEXT*PUBLIC*\* values
- [ ] CORS allows requests from frontend origin

---

## Part 11: Quick Reference - All Errors

| #   | Component           | Error                            | Line                        | Fix                                      |
| --- | ------------------- | -------------------------------- | --------------------------- | ---------------------------------------- |
| 1   | contracts.py        | Wrong import path                | 14                          | `app.validators`                         |
| 2   | contracts.py        | Route order conflict             | N/A                         | Move `/by-wallet` before `/{link_token}` |
| 3   | Contract schema     | Missing party_b creation         | POST /contracts             | Add email→user lookup                    |
| 4   | Contract response   | No contract_id field             | ALL                         | Generate "BDL-" prefix ID                |
| 5   | Contract response   | Enum not converted               | ALL                         | Add type string conversion               |
| 6   | Contract response   | amount_usdc as number            | ALL                         | Convert to string                        |
| 7   | Contract response   | User IDs instead of names        | ALL                         | Join with User table                     |
| 8   | Status mapping      | DRAFT vs CREATED                 | ALL                         | Add translation layer                    |
| 9   | Status mapping      | LOCKED vs ACTIVE                 | ALL                         | Map in response                          |
| 10  | Reputation response | completed_contracts vs completed | GET /reputation             | Rename field                             |
| 11  | Reputation response | Missing signal_tags              | GET /reputation             | Generate from stats                      |
| 12  | Reputation response | Unclear ai_summary source        | POST /ai/reputation-summary | Document/verify                          |
| 13  | Disputes            | No GET endpoint                  | Query                       | Add GET /{id}                            |
| 14  | Disputes            | No resolve endpoint              | Lifecycle                   | Add POST /{id}/resolve                   |
| 15  | Amendments          | No list endpoint                 | Query                       | Add GET /?contract_id=                   |

---

## Conclusion

**Current State**: Backend has 80% of endpoints implemented, but data structure and naming misalignments will break frontend integration.

**Time to Fix**: ~3-4 hours for all P0 and P1 items

**Blockers for Frontend Launch**:

1. Import error (5 min fix)
2. Route ordering (5 min fix)
3. Party B creation logic (30 min)
4. Response data structure alignment (60 min)

**Recommendation**: Fix all P0 items first, then P1 items in order. Test each endpoint against frontend expectations.
