# TrustLink Backend — Setup Guide (MySQL + Ganache)

## Project Structure

```
trustlink-backend/
├── app/
│   ├── main.py                   ← FastAPI entry point
│   ├── core/
│   │   ├── config.py             ← Loads .env
│   │   └── database.py           ← MySQL connection
│   ├── models/
│   │   └── models.py             ← All database tables
│   ├── routes/
│   │   ├── health.py             ← GET /health
│   │   ├── contracts.py          ← Full contract lifecycle
│   │   ├── users.py              ← Reputation scores
│   │   ├── disputes.py           ← Dispute handling
│   │   ├── amendments.py         ← Scope change requests
│   │   └── ai.py                 ← Gemini scope builder + summaries
│   └── services/
│       ├── audit.py              ← Audit log writer
│       ├── blockchain.py         ← Web3.py → Ganache
│       └── ghost_protection.py   ← Hourly deadline checker
├── contracts/
│   ├── MockUSDC.sol              ← Deploy FIRST on Ganache
│   └── TrustLinkEscrow.sol       ← Deploy SECOND on Ganache
├── tests/
│   └── test_api.py
├── requirements.txt
└── .env.example
```

---

## STEP 1 — Start XAMPP

1. Open XAMPP Control Panel
2. Click **Start** on Apache and **Start** on MySQL
3. Open **phpMyAdmin** → http://localhost/phpmyadmin
4. Click **New** (left sidebar)
5. Database name: `trustlink` → Collation: `utf8mb4_unicode_ci` → **Create**

That's it. No password needed — XAMPP MySQL default is `root` with no password.

---

## STEP 2 — Start Ganache

1. Open Ganache
2. Click **Quickstart** (Ethereum)
3. You'll see 10 accounts, each pre-loaded with 100 ETH
4. Note the RPC server shown at the top — it should say `HTTP://127.0.0.1:7545`
5. Keep Ganache open the entire time you're developing

---

## STEP 3 — Python environment

Open a terminal in the `trustlink-backend` folder:

```bash
# Create virtual environment
python -m venv venv

# Activate
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install all packages
pip install -r requirements.txt
```

---

## STEP 4 — Set up your .env

```bash
cp .env.example .env
```

Open `.env`. Most defaults are already correct for XAMPP + Ganache.
You only need to fill in two things right now:

1. `SECRET_KEY` — type any random string, at least 32 characters
2. `GEMINI_API_KEY` — get free at https://aistudio.google.com/app/apikey

Leave `CONTRACT_ADDRESS` and `SIGNER_PRIVATE_KEY` empty for now.
You'll fill those after Step 5.

---

## STEP 5 — Deploy contracts in Remix

**This is where both you and Person B need to coordinate.**

### 5a. Connect Remix to Ganache

1. Go to https://remix.ethereum.org
2. In the **Deploy & Run** tab:
   - Environment → select **Custom - External Http Provider**
   - URL: `http://127.0.0.1:7545`
3. You'll see Ganache's 10 accounts appear in the Account dropdown

### 5b. Deploy MockUSDC first

1. Create file `MockUSDC.sol` in Remix → paste from `contracts/MockUSDC.sol`
2. **Compile** tab → Solidity `0.8.20` → Compile MockUSDC.sol
3. **Deploy** tab → select `MockUSDC` from the contract dropdown → Deploy
4. Copy the deployed address → save it (you'll need it in the next step)

### 5c. Deploy TrustLinkEscrow

1. Create file `TrustLinkEscrow.sol` → paste from `contracts/TrustLinkEscrow.sol`
2. Compile it
3. Deploy with these constructor args:
   - `_usdc` → paste the MockUSDC address from 5b
   - `_feeRecipient` → copy any Ganache account address (e.g. Account #2)
   - `_feeBps` → `200`
4. Copy the deployed TrustLinkEscrow address

### 5d. Mint test USDC

In Remix, expand the deployed MockUSDC contract and call:

```
mint(
  to: <any Ganache account address — this will be Party B in tests>,
  amount: 1000000000   (= 1000 USDC, since decimals = 6)
)
```

Repeat for any account you want to use as a test Party B.

### 5e. Update your .env

```env
CONTRACT_ADDRESS=<TrustLinkEscrow address from 5c>
SIGNER_PRIVATE_KEY=<private key of Ganache Account #0>
FEE_RECIPIENT=<address of Ganache Account #2>
```

To get a private key from Ganache:
→ Ganache UI → Accounts tab → click the key icon on the right of any account → copy

---

## STEP 6 — Run the server

```bash
uvicorn app.main:app --reload --port 8000
```

Expected output:

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
[Scheduler] Ghost protection started — runs every hour
INFO:     Application startup complete.
```

The app auto-creates all MySQL tables on first boot. Check phpMyAdmin to confirm:
`trustlink` database → you should see 7 tables:
`users`, `contracts`, `milestones`, `disputes`, `amendments`, `audit_log`, `reputation`

---

## STEP 7 — Verify everything works

**Browser:** http://localhost:8000/health

```json
{ "status": "ok", "database": "ok", "version": "0.1.0" }
```

**Interactive API docs:** http://localhost:8000/docs

---

## STEP 8 — Run the tests

```bash
pytest tests/ -v
```

---

## STEP 9 — What to send Person B (Frontend)

After deploying in Remix, send them:

1. **TrustLinkEscrow address** (from Step 5c)
2. **MockUSDC address** (from Step 5b) — they need this for USDC approval calls
3. **ABI** → Remix → Compiler tab → ABI button → Copy JSON → paste into a file

They cannot build the pay page or connect to the contract without these.

---

## API Quick Reference

| Method | Endpoint                  | What it does                         |
| ------ | ------------------------- | ------------------------------------ |
| GET    | /health                   | Server + DB status                   |
| POST   | /contracts/               | Create contract, get shareable link  |
| GET    | /contracts/:token         | Fetch contract details               |
| POST   | /contracts/:token/agree   | Party B agrees to terms              |
| POST   | /contracts/:token/lock    | Confirm funds locked on-chain        |
| POST   | /contracts/:token/release | Release payment to Party A           |
| GET    | /contracts/:token/audit   | Immutable audit trail                |
| GET    | /users/:wallet/reputation | Trust score + breakdown              |
| POST   | /ai/scope                 | AI structures a job description      |
| POST   | /ai/reputation-summary    | AI plain-language reputation summary |
| POST   | /disputes/                | Raise a dispute                      |
| POST   | /amendments/              | Propose scope change                 |
| POST   | /amendments/:id/accept    | Accept amendment                     |
| POST   | /amendments/:id/reject    | Reject amendment                     |

---

## Common Errors

**`Access denied for user 'root'@'localhost'`**
→ Your XAMPP MySQL isn't running. Check XAMPP Control Panel.

**`Can't connect to MySQL server`**
→ Double-check DATABASE_URL in .env — no password for XAMPP default: `root:@localhost`

**`No module named 'pymysql'`**
→ You're not in your virtual env. Run `venv\Scripts\activate` (Windows) first.

**`Connection refused` on blockchain calls**
→ Ganache isn't running. Open Ganache and click Quickstart.

**`Contract address is zero`**
→ You haven't deployed yet or forgot to update CONTRACT_ADDRESS in .env.
