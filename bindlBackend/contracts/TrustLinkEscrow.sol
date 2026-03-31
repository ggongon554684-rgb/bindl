// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

library SafeERC20 {
    function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        require(token.transferFrom(from, to, amount), "SafeERC20: transfer failed");
    }

    function safeTransfer(IERC20 token, address to, uint256 amount) internal {
        require(token.transfer(to, amount), "SafeERC20: transfer failed");
    }
}

contract TrustLinkEscrow {

    IERC20  public immutable usdc;
    address public immutable feeRecipient;
    uint256 public immutable feeBps;
    address public           owner;
    uint256 public           escrowCounter;

    enum EscrowStatus { LOCKED, RELEASED, DISPUTED, CANCELLED }

    struct Milestone {
        uint256 amount;
        bool    released;
    }

    struct Escrow {
        address      partyA;
        address      partyB;
        uint256      amount;
        EscrowStatus status;
        bytes32      termsHash;
        uint256      deadline;
        string       disputeReason;
        address      disputeResolver;
        uint256      disputeResolvedAt;
        Milestone[]  milestones;
    }

    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(uint256 indexed escrowId, address indexed partyA, address indexed partyB, uint256 amount, bytes32 termsHash);
    event FundsLocked(uint256 indexed escrowId, address indexed partyB, uint256 amount);
    event FundsReleased(uint256 indexed escrowId, address recipient, uint256 amount);
    event MilestoneReleased(uint256 indexed escrowId, uint256 milestoneIndex, uint256 amount);
    event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy, string reason, uint256 timestamp);
    event DisputeResolved(uint256 indexed escrowId, address indexed winner, uint256 amount, address indexed resolver, uint256 timestamp);
    event EscrowCancelled(uint256 indexed escrowId);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyParties(uint256 id) {
        require(msg.sender == escrows[id].partyA || msg.sender == escrows[id].partyB, "Not a party"); _;
    }
    modifier inStatus(uint256 id, EscrowStatus s) { require(escrows[id].status == s, "Wrong status"); _; }

    constructor(address _usdc, address _feeRecipient, uint256 _feeBps) {
        require(_feeBps <= 1000, "Fee too high");
        usdc         = IERC20(_usdc);
        feeRecipient = _feeRecipient;
        feeBps       = _feeBps;
        owner        = msg.sender;
    }

    function lockFunds(
        address partyA, uint256 amount, bytes32 termsHash,
        uint256 deadline, uint256[] calldata milestoneAmounts
    ) external returns (uint256 escrowId) {
        require(amount > 0,               "Amount must be > 0");
        require(partyA != address(0),     "Invalid partyA");
        require(msg.sender != address(0), "Invalid partyB");
        require(partyA != msg.sender,     "PartyA and partyB must differ");
        require(deadline > block.timestamp, "Deadline in the past");
        require(deadline <= block.timestamp + 365 days, "Deadline too far in future");

        if (milestoneAmounts.length > 0) {
            uint256 total = 0;
            for (uint i = 0; i < milestoneAmounts.length; i++) {
                require(milestoneAmounts[i] > 0, "Milestone amount must be > 0");
                total += milestoneAmounts[i];
            }
            require(total == amount, "Milestones must sum to total");
        }

        SafeERC20.safeTransferFrom(usdc, msg.sender, address(this), amount);

        escrowId = escrowCounter++;
        Escrow storage e = escrows[escrowId];
        e.partyA    = partyA;
        e.partyB    = msg.sender;
        e.amount    = amount;
        e.status    = EscrowStatus.LOCKED;
        e.termsHash = termsHash;
        e.deadline  = deadline;

        for (uint i = 0; i < milestoneAmounts.length; i++)
            e.milestones.push(Milestone({amount: milestoneAmounts[i], released: false}));

        emit EscrowCreated(escrowId, partyA, msg.sender, amount, termsHash);
        emit FundsLocked(escrowId, msg.sender, amount);
    }

    function releaseFunds(uint256 escrowId)
        external onlyParties(escrowId) inStatus(escrowId, EscrowStatus.LOCKED)
    {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.partyA || msg.sender == owner, "Only partyA can approve");
        e.status = EscrowStatus.RELEASED;
        uint256 fee    = (e.amount * feeBps) / 10000;
        uint256 payout = e.amount - fee;
        SafeERC20.safeTransfer(usdc, e.partyB, payout);
        if (fee > 0) SafeERC20.safeTransfer(usdc, feeRecipient, fee);
        emit FundsReleased(escrowId, e.partyB, payout);
    }

    function releaseMilestone(uint256 escrowId, uint256 milestoneIndex)
        external inStatus(escrowId, EscrowStatus.LOCKED)
    {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.partyA || msg.sender == owner, "Only partyA");
        require(milestoneIndex < e.milestones.length, "Invalid milestone");
        require(!e.milestones[milestoneIndex].released,  "Already released");
        e.milestones[milestoneIndex].released = true;
        uint256 amount = e.milestones[milestoneIndex].amount;
        uint256 fee    = (amount * feeBps) / 10000;
        SafeERC20.safeTransfer(usdc, e.partyB, amount - fee);
        if (fee > 0) SafeERC20.safeTransfer(usdc, feeRecipient, fee);
        bool allDone = true;
        for (uint i = 0; i < e.milestones.length; i++)
            if (!e.milestones[i].released) { allDone = false; break; }
        if (allDone) e.status = EscrowStatus.RELEASED;
        emit MilestoneReleased(escrowId, milestoneIndex, amount - fee);
    }

    function raiseDispute(uint256 escrowId, string calldata reason)
        external onlyParties(escrowId) inStatus(escrowId, EscrowStatus.LOCKED)
    {
        Escrow storage e = escrows[escrowId];
        require(bytes(reason).length > 0, "Reason required");
        e.status = EscrowStatus.DISPUTED;
        e.disputeReason = reason;
        emit DisputeRaised(escrowId, msg.sender, reason, block.timestamp);
    }

    function resolveDispute(uint256 escrowId, bool refundPartyB)
        external onlyOwner inStatus(escrowId, EscrowStatus.DISPUTED)
    {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.DISPUTED, "Not disputed");
        e.status = EscrowStatus.RELEASED;
        e.disputeResolver = msg.sender;
        e.disputeResolvedAt = block.timestamp;
        address winner = refundPartyB ? e.partyB : e.partyA;
        uint256 fee    = (e.amount * feeBps) / 10000;
        uint256 payout = e.amount - fee;
        SafeERC20.safeTransfer(usdc, winner, payout);
        if (fee > 0) SafeERC20.safeTransfer(usdc, feeRecipient, fee);
        emit DisputeResolved(escrowId, winner, payout, msg.sender, block.timestamp);
    }

    function cancelEscrow(uint256 escrowId) external onlyOwner {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.LOCKED || e.status == EscrowStatus.DISPUTED, "Cannot cancel");
        e.status = EscrowStatus.CANCELLED;
        SafeERC20.safeTransfer(usdc, e.partyB, e.amount);
        emit EscrowCancelled(escrowId);
    }

    function getEscrow(uint256 escrowId) external view returns (
        address partyA, address partyB, uint256 amount, EscrowStatus status, bytes32 termsHash
    ) {
        Escrow storage e = escrows[escrowId];
        return (e.partyA, e.partyB, e.amount, e.status, e.termsHash);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }
}
