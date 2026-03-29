"""Input validation utilities for TrustLink contract operations."""

from datetime import datetime, timedelta
from typing import Optional, Tuple

try:
    from web3 import Web3
    WEB3_AVAILABLE = True
except ImportError:
    WEB3_AVAILABLE = False
    Web3 = None


def validate_ethereum_address(address: str) -> Tuple[bool, Optional[str]]:
    """
    Validate Ethereum address format and checksum.
    
    Args:
        address: Ethereum address string
        
    Returns:
        Tuple of (is_valid: bool, error_message: Optional[str])
    """
    if not address:
        return False, "Address cannot be empty"
    
    if not isinstance(address, str):
        return False, "Address must be a string"
    
    if not WEB3_AVAILABLE:
        # Fallback validation without web3
        address_lower = address.lower()
        if not (address_lower.startswith('0x') and len(address_lower) == 42 and all(c in '0123456789abcdef' for c in address_lower[2:])):
            return False, "Invalid Ethereum address format"
        return True, None
    
    # Check if valid hex format and correct length
    if not Web3.is_address(address):
        return False, "Invalid Ethereum address format"
    
    # Validate checksum (if provided with mixed case)
    try:
        checksum_address = Web3.to_checksum_address(address)
        # If address has mixed case, verify it matches checksum
        if address != address.lower() and address != address.upper():
            if address != checksum_address:
                return False, "Invalid address checksum"
    except Exception:
        return False, "Invalid address format"
    
    return True, None


def validate_contract_amount(
    amount: float,
    min_amount: float = 0.000001,  # 1 USDC (smallest unit with 6 decimals)
    max_amount: float = 1e15
) -> Tuple[bool, Optional[str]]:
    """
    Validate contract amount for escrow.
    
    Args:
        amount: Amount in USDC (with decimals)
        min_amount: Minimum allowed amount
        max_amount: Maximum allowed amount
        
    Returns:
        Tuple of (is_valid: bool, error_message: Optional[str])
    """
    if amount is None:
        return False, "Amount cannot be empty"
    
    # Check if numeric
    try:
        amount_float = float(amount)
    except (ValueError, TypeError):
        return False, "Amount must be a valid number"
    
    # Check if positive
    if amount_float <= 0:
        return False, "Amount must be greater than 0"
    
    # Check if within bounds
    if amount_float < min_amount:
        return False, f"Amount must be at least {min_amount} USDC"
    
    if amount_float > max_amount:
        return False, f"Amount cannot exceed {max_amount} USDC"
    
    # USDC has 6 decimals (0.000001 is smallest unit)
    # Check if amount has at most 6 decimal places
    amount_str = str(amount_float)
    if '.' in amount_str:
        decimals = len(amount_str.split('.')[1])
        if decimals > 6:
            return False, "Amount cannot have more than 6 decimal places"
    
    return True, None


def validate_deadline(deadline: datetime) -> Tuple[bool, Optional[str]]:
    """
    Validate contract deadline.
    
    Args:
        deadline: Deadline as datetime object
        
    Returns:
        Tuple of (is_valid: bool, error_message: Optional[str])
    """
    if deadline is None:
        return False, "Deadline cannot be empty"
    
    if not isinstance(deadline, datetime):
        try:
            # Try to parse if it's a timestamp
            if isinstance(deadline, (int, float)):
                deadline = datetime.fromtimestamp(deadline)
            else:
                return False, "Deadline must be a valid datetime object or timestamp"
        except Exception:
            return False, "Invalid deadline format"
    
    from datetime import timezone
    now = datetime.now(timezone.utc)
    # Make deadline timezone-aware if it isn't already
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    min_deadline = now + timedelta(hours=24)
    max_deadline = now + timedelta(days=365)
    
    # Check if deadline is in the future
    if deadline <= now:
        return False, "Deadline must be in the future"
    
    # Check if deadline is at least 24 hours away
    if deadline < min_deadline:
        return False, "Deadline must be at least 24 hours in the future"
    
    # Check if deadline is not too far in the future
    if deadline > max_deadline:
        return False, "Deadline cannot be more than 1 year in the future"
    
    return True, None


def validate_wallet_and_amount_pair(
    wallet_address: str,
    amount: float
) -> Tuple[bool, Optional[str]]:
    """
    Validate both wallet address and amount together.
    
    Args:
        wallet_address: Ethereum address
        amount: Amount in USDC
        
    Returns:
        Tuple of (is_valid: bool, error_message: Optional[str])
    """
    is_valid, error = validate_ethereum_address(wallet_address)
    if not is_valid:
        return False, f"Invalid wallet address: {error}"
    
    is_valid, error = validate_contract_amount(amount)
    if not is_valid:
        return False, f"Invalid amount: {error}"
    
    return True, None


def validate_parties_differ(party_a: str, party_b: str) -> Tuple[bool, Optional[str]]:
    """
    Validate that two parties are different addresses.
    
    Args:
        party_a: First party address
        party_b: Second party address
        
    Returns:
        Tuple of (is_valid: bool, error_message: Optional[str])
    """
    is_valid, error = validate_ethereum_address(party_a)
    if not is_valid:
        return False, f"Invalid partyA: {error}"
    
    is_valid, error = validate_ethereum_address(party_b)
    if not is_valid:
        return False, f"Invalid partyB: {error}"
    
    # Normalize to checksum format for comparison
    party_a_checksum = Web3.to_checksum_address(party_a)
    party_b_checksum = Web3.to_checksum_address(party_b)
    
    if party_a_checksum == party_b_checksum:
        return False, "PartyA and PartyB must be different addresses"
    
    return True, None


def validate_milestone_amounts(
    milestones: list,
    total_amount: float
) -> Tuple[bool, Optional[str]]:
    """
    Validate milestone amounts sum to total amount.
    
    Args:
        milestones: List of milestone amounts
        total_amount: Total contract amount
        
    Returns:
        Tuple of (is_valid: bool, error_message: Optional[str])
    """
    if not milestones:
        return True, None  # Milestones are optional
    
    if not isinstance(milestones, list):
        return False, "Milestones must be a list"
    
    if len(milestones) == 0:
        return True, None
    
    try:
        milestone_sum = sum(float(m) for m in milestones)
    except (ValueError, TypeError):
        return False, "All milestone amounts must be numeric"
    
    # Check each milestone is positive
    for i, milestone in enumerate(milestones):
        try:
            m_float = float(milestone)
            if m_float <= 0:
                return False, f"Milestone {i} must be greater than 0"
            if m_float > total_amount:
                return False, f"Milestone {i} cannot exceed total amount"
        except (ValueError, TypeError):
            return False, f"Milestone {i} must be numeric"
    
    # Allow small floating-point tolerance (0.000001 = 1 smallest USDC unit)
    tolerance = 0.000001
    if abs(milestone_sum - total_amount) > tolerance:
        return False, f"Milestone amounts must sum to total amount (sum: {milestone_sum}, total: {total_amount})"
    
    return True, None