# Detailed Bug Report: Empty Status Field in Contract API Responses

**Date:** March 29, 2026  
**Status:** 🔴 BLOCKING - Cannot proceed with workflow testing  
**Severity:** CRITICAL - Affects all downstream contract operations

---

## 1. OBJECTIVE

Implement and test a complete contract transaction workflow with the following lifecycle:

```
DRAFT (created by Party A)
  ↓
ONGOING (both parties agreed)
  ↓
[WORK_SUBMITTED by Party B]
  ↓
[WORK_APPROVED by Party A]
  ↓
LOCKED (funds escrowed)
  ↓
RELEASED (work complete, funds released)
```

---

## 2. WHAT'S BEEN COMPLETED ✅

### 2.1 Database Schema

- **Migration Created:** `add_work_submission_fields.py` (applied successfully)
- **New Columns Added:**
  - `party_a_agreed_at` (DateTime)
  - `party_b_agreed_at` (DateTime)
  - `work_submitted_at` (DateTime)
  - `work_submitted_by` (ForeignKey to User)
  - `work_approved_at` (DateTime)
  - `work_approved_by` (ForeignKey to User)

- **Migration Status:** ✅ Applied successfully
  ```
  $ alembic upgrade heads
  Running upgrade f7f5934c8991 -> add_work_submission_fields
  ```

### 2.2 Backend Endpoints

All 5 endpoints created in [bindlBackend/app/routes/contracts.py](bindlBackend/app/routes/contracts.py):

| Endpoint                     | Method          | Status                                    |
| ---------------------------- | --------------- | ----------------------------------------- |
| `POST /contracts/`           | Create contract | ✅ Works - returns status "CREATED"       |
| `POST /{token}/agree`        | Party B agrees  | ⚠️ Runs but status field empty            |
| `POST /{token}/submit-work`  | Submit work     | ❌ Can't test - depends on ONGOING status |
| `POST /{token}/approve-work` | Approve work    | ❌ Can't test - depends on ONGOING status |
| `POST /{token}/lock`         | Lock funds      | ❌ Can't test - status check fails        |

### 2.3 Error Handling

- Added `get_or_create_user()` with IntegrityError handling
- Handles race conditions and email conflicts
- Validates Ethereum wallet addresses
- Validates contract amounts and deadlines

### 2.4 Server Status

- Backend server running on port 8000 ✅
- FastAPI application initializes without errors ✅
- Database connections working ✅
- Contracts are being created and saved ✅

---

## 3. THE BLOCKING BUG 🔴

### 3.1 Symptom

The `status` field is **returning an empty string** `""` instead of enum values like `"DRAFT"`, `"ONGOING"`, `"CREATED"`, etc.

### 3.2 Evidence from Test Run

**Test:** `POST /contracts/VFgs9aGbZTwEr7ibg69MhIr8LG1ot11ov2PGTgNdEXg/agree`

**Expected Response:**

```json
{
  "agreed": true,
  "status": "ONGOING",
  "terms_hash": "0xe7134c981825895eeedc42ed85313337b8e92be7fd09e91f86d45b016017c254",
  "next": "work_submission",
  "party_b_id": "66addacc-427f-47f7-bd73-c3ff652bac97"
}
```

**Actual Response:**

```json
{
  "agreed": true,
  "status": "", // ❌ EMPTY!
  "terms_hash": "0xe7134c981825895eeedc42ed85313337b8e92be7fd09e91f86d45b016017c254",
  "next": "work_submission",
  "party_b_id": "66addacc-427f-47f7-bd73-c3ff652bac97"
}
```

### 3.3 Cascading Failures

Because status is empty, all downstream checks fail:

**POST /submit-work Error:**

```json
{
  "detail": "Contract must be ONGOING to submit work. Status: "
}
```

The error message shows empty status, confirming the value is `""`.

**POST /lock Error:**

```json
{
  "detail": "Contract cannot be locked from  state"
}
```

Again, empty status in the error message.

### 3.4 Affected Endpoints

| Endpoint              | Impact                        |
| --------------------- | ----------------------------- |
| `GET /{token}`        | Returns empty status          |
| `POST /{token}/agree` | Returns empty status          |
| All error messages    | Unhelpful (show empty status) |

---

## 4. ROOT CAUSE ANALYSIS 🔍

### 4.1 Code Involved

**File:** `bindlBackend/app/routes/contracts.py`

**Helper Function (Created to fix enum handling):**

```python
def get_enum_value(enum_obj):
    """Safely get enum value - handles both Enum objects and plain strings"""
    if enum_obj is None:
        return None
    if isinstance(enum_obj, str):
        return enum_obj
    return enum_obj.value if hasattr(enum_obj, 'value') else str(enum_obj)
```

**Usage in /agree endpoint (Line ~463):**

```python
return {
    "agreed": True,
    "status": STATUS_MAP.get(get_enum_value(contract.status), get_enum_value(contract.status)),
    "terms_hash": contract.terms_hash,
    "next": "proceed_to_payment" if contract.status == ContractStatus.DRAFT else "work_submission",
    "party_b_id": str(party_b.id),
}
```

**STATUS_MAP Definition (Line ~28-35):**

```python
STATUS_MAP = {
    "draft":     "CREATED",
    "ongoing":   "ONGOING",
    "locked":    "ACTIVE",
    "milestone": "ACTIVE",
    "released":  "COMPLETE",
    "disputed":  "DISPUTED",
    "cancelled": "CANCELLED",
    "expired":   "EXPIRED",
}
```

### 4.2 Suspected Issue

**Hypothesis 1: SQLAlchemy Enum Mismatch**

- Database enum column uses `SAEnum(ContractStatus)`
- When retrieved from DB, the status might be returned as a string `"ongoing"` instead of `ContractStatus.ONGOING` enum object
- The `get_enum_value()` function checks `isinstance(enum_obj, str)` and should return it as-is
- But somehow the result is empty

**Hypothesis 2: STATUS_MAP Lookup Failure**

- `get_enum_value()` returns the correct value (e.g., `"ongoing"`)
- But `STATUS_MAP.get("ongoing")` is returning `None` (not in dict)
- When `.get()` returns `None`, the fallback `get_enum_value(contract.status)` is executed
- But this is being serialized as empty string somewhere

**Hypothesis 3: JSON Serialization Issue**

- The value might be `None` and FastAPI is serializing it as `""`
- Or there's a custom JSON encoder that's converting None to empty string

### 4.3 Timeline of Changes

1. **Initial Code:** Used `contract.status.value` directly
2. **Problem:** Got `AttributeError: 'str' object has no attribute 'value'`
   - This indicates database was returning strings, not enums
3. **Fix Attempt:** Created `get_enum_value()` helper
4. **Result:** Now returns empty strings instead of errors
   - Progress but not correct

### 4.4 Database State

**What should be stored:** Enum value → `"draft"`, `"ongoing"`, etc.  
**What's being returned:** Unknown (appears to be empty or None)

---

## 5. TEST EVIDENCE

### 5.1 Full Test Output

```
======================================================================
TEST 1: Create Contract
======================================================================
Status Code: 201
Response: {
  "contract_id": "BDL-D1906D",
  "status": "CREATED",                    // ✅ WORKS - "CREATED"
  ...
}

======================================================================
TEST 2: Party B Agrees
======================================================================
Status Code: 200
Response: {
  "agreed": true,
  "status": "",                          // ❌ EMPTY!
  ...
}

======================================================================
TEST 3: Get Contract Details
======================================================================
Status Code: 200
Response: {
  "contract_id": "BDL-D1906D",
  "status": "",                          // ❌ EMPTY!
  ...
}

======================================================================
TEST 4: Party B Submits Work
======================================================================
Status Code: 400
Response: {
  "detail": "Contract must be ONGOING to submit work. Status: "  // ❌ Empty status shown
}
```

### 5.2 Interesting Observation

**POST /contracts/** returns:

```json
"status": "CREATED"
```

But calls the same `STATUS_MAP.get()` logic! This works correctly.

**Difference:** In create_contract, status is set at creation time:

```python
contract = Contract(
    status = ContractStatus.DRAFT,  # ← Fresh enum object
    ...
)
db.add(contract)
db.flush()
...
return {
    "status": STATUS_MAP.get(get_enum_value(contract.status), ...),
    ...
}
```

But in `/agree`, the status is updated after retrieval:

```python
contract = db.query(Contract).filter(...).first()  # ← Retrieved from DB
...
contract.status = ContractStatus.ONGOING  # ← Updated in memory
db.commit()
db.refresh(contract)  # ← Refreshed from DB
...
return {
    "status": STATUS_MAP.get(get_enum_value(contract.status), ...),
    ...
}
```

**Key Difference:** `db.refresh()` might be the culprit!

---

## 6. CODE LOCATIONS

| File                                                                         | Lines   | What                             |
| ---------------------------------------------------------------------------- | ------- | -------------------------------- |
| [bindlBackend/app/routes/contracts.py](bindlBackend/app/routes/contracts.py) | 95-99   | `get_enum_value()` function      |
| [bindlBackend/app/routes/contracts.py](bindlBackend/app/routes/contracts.py) | 28-35   | `STATUS_MAP` definition          |
| [bindlBackend/app/routes/contracts.py](bindlBackend/app/routes/contracts.py) | 320-325 | /agree endpoint response         |
| [bindlBackend/app/routes/contracts.py](bindlBackend/app/routes/contracts.py) | 393-405 | /get endpoint response           |
| [bindlBackend/app/models/models.py](bindlBackend/app/models/models.py)       | 25-29   | `ContractStatus` enum definition |

---

## 7. WHAT NEEDS INVESTIGATION

1. **How is SQLAlchemy returning the enum after `db.refresh()`?**
   - Is it returning a string or enum object?
   - Can we add direct logging to check?

2. **What does `get_enum_value()` actually receive?**
   - Need to add debug logging to see the type and value

3. **Why does contract creation work but contract updates don't?**
   - Is the issue specific to `db.refresh()`?
   - Is it a transaction issue?

4. **Should we change the approach?**
   - Store status as string in DB instead of Enum?
   - Use a different serialization method?
   - Change when/how we refresh?

---

## 8. NEXT STEPS NEEDED

1. **Add Debug Logging**

   ```python
   status_value = get_enum_value(contract.status)
   print(f"DEBUG: status_value = {repr(status_value)}, type = {type(status_value)}")
   mapped_status = STATUS_MAP.get(status_value)
   print(f"DEBUG: mapped_status = {repr(mapped_status)}")
   ```

2. **Test Without db.refresh()**
   - Remove `db.refresh(contract)` and see if status is correct

3. **Check SQLAlchemy Configuration**
   - Verify enum handling in [bindlBackend/app/core/database.py](bindlBackend/app/core/database.py)

4. **Consider Alternative Approach**
   - Use string column instead of Enum type?
   - Use custom serializer?

---

## 9. IMPACT ASSESSMENT

| Component            | Status         | Impact                        |
| -------------------- | -------------- | ----------------------------- |
| Contract Creation    | ✅ Works       | Can create contracts          |
| Party B Agreement    | ⚠️ Broken      | Can't validate next step      |
| Work Submission      | ❌ Blocked     | Depends on ONGOING status     |
| Work Approval        | ❌ Blocked     | Depends on previous steps     |
| Fund Locking         | ❌ Blocked     | Status validation fails       |
| **Overall Workflow** | 🔴 **BLOCKED** | Cannot proceed past agreement |

---

## 10. FILES AFFECTED

- `bindlBackend/app/routes/contracts.py` - Main endpoint logic
- `bindlBackend/app/models/models.py` - Database models
- `bindlBackend/app/core/database.py` - Database configuration
- `test_workflow.py` - Test script (workspace root)

---

## 11. SENIOR DEVELOPER QUESTIONS

1. **Is this a known SQLAlchemy gotcha with Enum + db.refresh()?**
2. **Should enums be handled differently in FastAPI/SQLAlchemy?**
3. **Is the database schema migration correct for the Enum column?**
4. **Should we store status as String instead of Enum in this case?**
5. **Any recommended debugging approach for SQLAlchemy Enum issues?**

---

**Report Generated:** March 29, 2026 (Database time shows 2026-03-29T05:21:31)  
**Test Environment:**

- Python 3.12
- FastAPI + Uvicorn
- SQLAlchemy 2.x
- MySQL 8.0
- Windows 11
