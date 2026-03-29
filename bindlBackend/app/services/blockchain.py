try:
    from web3 import Web3
    WEB3_AVAILABLE = True
except ImportError as e:
    print(f"[WARNING] Web3 import failed: {e}. Blockchain features will be disabled.")
    WEB3_AVAILABLE = False
    Web3 = None

from app.core.config import get_settings

settings = get_settings()

if WEB3_AVAILABLE and Web3:
    try:
        w3 = Web3(Web3.HTTPProvider(settings.BASE_RPC_URL))
        signer = w3.eth.account.from_key(settings.SIGNER_PRIVATE_KEY)
    except Exception as e:
        print(f"[WARNING] Web3 initialization failed: {e}. Blockchain features will be disabled.")
        WEB3_AVAILABLE = False
        w3 = None
        signer = None
else:
    w3 = None
    signer = None

ESCROW_ABI = [
    {"inputs":[{"internalType":"uint256","name":"escrowId","type":"uint256"}],
     "name":"releaseFunds","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"escrowId","type":"uint256"},
               {"internalType":"uint256","name":"milestoneIndex","type":"uint256"}],
     "name":"releaseMilestone","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"escrowId","type":"uint256"},
               {"internalType":"bool","name":"refundPartyB","type":"bool"}],
     "name":"resolveDispute","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"escrowId","type":"uint256"}],
     "name":"getEscrow",
     "outputs":[{"internalType":"address","name":"partyA","type":"address"},
                {"internalType":"address","name":"partyB","type":"address"},
                {"internalType":"uint256","name":"amount","type":"uint256"},
                {"internalType":"uint8","name":"status","type":"uint8"},
                {"internalType":"bytes32","name":"termsHash","type":"bytes32"}],
     "stateMutability":"view","type":"function"},
]

escrow_contract = None
if WEB3_AVAILABLE and w3:
    try:
        escrow_contract = w3.eth.contract(
            address=Web3.to_checksum_address(settings.CONTRACT_ADDRESS),
            abi=ESCROW_ABI,
        )
    except Exception as e:
        print(f"[WARNING] Failed to initialize escrow contract: {e}")


def get_contract_status(escrow_id: str) -> dict:
    if not WEB3_AVAILABLE or not escrow_contract:
        return {"error": "Web3 not available", "escrow_id": escrow_id}
    try:
        r = escrow_contract.functions.getEscrow(int(escrow_id)).call()
        status_map = {0: "LOCKED", 1: "RELEASED", 2: "DISPUTED", 3: "CANCELLED"}
        return {
            "party_a": r[0], "party_b": r[1], "amount_wei": r[2],
            "status": status_map.get(r[3], "UNKNOWN"),
            "terms_hash": "0x" + r[4].hex()
        }
    except Exception as e:
        return {"error": str(e)}


async def release_funds_tx(escrow_id: str, milestone_index=None) -> str:
    if not WEB3_AVAILABLE or not w3 or not signer:
        raise Exception("Web3 not available")
    
    nonce     = w3.eth.get_transaction_count(signer.address)
    gas_price = w3.eth.gas_price

    if milestone_index is not None:
        tx = escrow_contract.functions.releaseMilestone(
            int(escrow_id), milestone_index
        ).build_transaction({
            "from": signer.address, "nonce": nonce,
            "gasPrice": gas_price, "gas": 200000,
            "chainId": settings.CHAIN_ID
        })
    else:
        tx = escrow_contract.functions.releaseFunds(
            int(escrow_id)
        ).build_transaction({
            "from": signer.address, "nonce": nonce,
            "gasPrice": gas_price, "gas": 200000,
            "chainId": settings.CHAIN_ID
        })

    signed  = w3.eth.account.sign_transaction(tx, settings.SIGNER_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    if receipt.status != 1:
        raise Exception(f"Transaction reverted: {tx_hash.hex()}")
    return tx_hash.hex()