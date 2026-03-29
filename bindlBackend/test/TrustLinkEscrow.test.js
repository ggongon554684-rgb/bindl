const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TrustLinkEscrow", function () {
  let escrow, mockUSDC;
  let owner, partyA, partyB, feeRecipient, other;
  const AMOUNT = ethers.parseUnits("1000", 6);
  const FEE_BPS = 100; // 1% fee

  beforeEach(async function () {
    [owner, partyA, partyB, feeRecipient, other] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();

    // Mint some USDC to partyB
    await mockUSDC.mint(partyB.address, ethers.parseUnits("10000", 6));

    // Deploy Escrow
    const TrustLinkEscrow = await ethers.getContractFactory("TrustLinkEscrow");
    escrow = await TrustLinkEscrow.deploy(mockUSDC, feeRecipient, FEE_BPS);

    // Approve escrow to spend USDC
    await mockUSDC
      .connect(partyB)
      .approve(escrow, ethers.parseUnits("10000", 6));
  });

  describe("Deployment", function () {
    it("Should have correct USDC address", async function () {
      expect(await escrow.usdc()).to.equal(mockUSDC);
    });

    it("Should have correct fee recipient", async function () {
      expect(await escrow.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("Should have correct fee basis points", async function () {
      expect(await escrow.feeBps()).to.equal(FEE_BPS);
    });

    it("Should set owner to deployer", async function () {
      expect(await escrow.owner()).to.equal(owner.address);
    });
  });

  describe("lockFunds", function () {
    it("Should lock funds correctly", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days from now

      const tx = await escrow
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, []);

      expect(tx).to.emit(escrow, "EscrowCreated");
      expect(tx).to.emit(escrow, "FundsLocked");

      const escrowData = await escrow.getEscrow(0);
      expect(escrowData.partyA).to.equal(partyA.address);
      expect(escrowData.partyB).to.equal(partyB.address);
      expect(escrowData.amount).to.equal(AMOUNT);
      expect(escrowData.status).to.equal(0); // LOCKED
    });

    it("Should transfer USDC to escrow", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      const balanceBefore = await mockUSDC.balanceOf(escrow);
      await escrow
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, []);

      const balanceAfter = await mockUSDC.balanceOf(escrow);
      expect(balanceAfter - balanceBefore).to.equal(AMOUNT);
    });

    it("Should reject zero amount", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      await expect(
        escrow
          .connect(partyB)
          .lockFunds(partyA.address, 0, termsHash, deadline, []),
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("Should reject partyA as zero address", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      await expect(
        escrow
          .connect(partyB)
          .lockFunds(ethers.ZeroAddress, AMOUNT, termsHash, deadline, []),
      ).to.be.revertedWith("Invalid partyA");
    });

    it("Should reject if partyA equals partyB", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      await expect(
        escrow
          .connect(partyB)
          .lockFunds(partyB.address, AMOUNT, termsHash, deadline, []),
      ).to.be.revertedWith("PartyA and partyB must differ");
    });

    it("Should reject past deadline", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const pastDeadline = Math.floor(Date.now() / 1000) - 1000;

      await expect(
        escrow
          .connect(partyB)
          .lockFunds(partyA.address, AMOUNT, termsHash, pastDeadline, []),
      ).to.be.revertedWith("Deadline in the past");
    });

    it("Should reject deadline more than 365 days in future", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const farDeadline = Math.floor(Date.now() / 1000) + 366 * 24 * 60 * 60;

      await expect(
        escrow
          .connect(partyB)
          .lockFunds(partyA.address, AMOUNT, termsHash, farDeadline, []),
      ).to.be.revertedWith("Deadline too far in future");
    });

    it("Should handle milestones", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      const milestone1 = ethers.parseUnits("600", 6);
      const milestone2 = ethers.parseUnits("400", 6);

      await escrow
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, [
          milestone1,
          milestone2,
        ]);

      const escrowData = await escrow.getEscrow(0);
      expect(escrowData.amount).to.equal(AMOUNT);
    });

    it("Should reject milestone amounts that don't sum to total", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      const milestone1 = ethers.parseUnits("600", 6);
      const milestone2 = ethers.parseUnits("300", 6); // Sum doesn't equal AMOUNT

      await expect(
        escrow
          .connect(partyB)
          .lockFunds(partyA.address, AMOUNT, termsHash, deadline, [
            milestone1,
            milestone2,
          ]),
      ).to.be.revertedWith("Milestones must sum to total");
    });

    it("Should reject milestone with zero amount", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      const milestone1 = ethers.parseUnits("500", 6);
      const milestone2 = ethers.parseUnits("0", 6);

      await expect(
        escrow
          .connect(partyB)
          .lockFunds(partyA.address, AMOUNT, termsHash, deadline, [
            milestone1,
            milestone2,
          ]),
      ).to.be.revertedWith("Milestone amount must be > 0");
    });

    it("Should increment escrow counter", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      expect(await escrow.escrowCounter()).to.equal(0);

      await escrow
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, []);

      expect(await escrow.escrowCounter()).to.equal(1);
    });
  });

  describe("releaseFunds", function () {
    let escrowId;

    beforeEach(async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      await escrow
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, []);
      escrowId = 0;
    });

    it("PartyA should be able to release funds", async function () {
      await escrow.connect(partyA).releaseFunds(escrowId);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(1); // RELEASED
    });

    it("Owner should be able to release funds", async function () {
      await escrow.connect(owner).releaseFunds(escrowId);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(1); // RELEASED
    });

    it("Should transfer funds to partyA minus fee", async function () {
      const expectedFee = (AMOUNT * BigInt(FEE_BPS)) / BigInt(10000);
      const expectedPayout = AMOUNT - expectedFee;

      const balanceBefore = await mockUSDC.balanceOf(partyA.address);
      await escrow.connect(partyA).releaseFunds(escrowId);
      const balanceAfter = await mockUSDC.balanceOf(partyA.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedPayout);
    });

    it("Should transfer fee to fee recipient", async function () {
      const expectedFee = (AMOUNT * BigInt(FEE_BPS)) / BigInt(10000);

      const balanceBefore = await mockUSDC.balanceOf(feeRecipient.address);
      await escrow.connect(partyA).releaseFunds(escrowId);
      const balanceAfter = await mockUSDC.balanceOf(feeRecipient.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedFee);
    });

    it("Should emit FundsReleased event", async function () {
      const expectedFee = (AMOUNT * BigInt(FEE_BPS)) / BigInt(10000);
      const expectedPayout = AMOUNT - expectedFee;

      await expect(escrow.connect(partyA).releaseFunds(escrowId))
        .to.emit(escrow, "FundsReleased")
        .withArgs(escrowId, partyA.address, expectedPayout);
    });

    it("Should reject non-party trying to release", async function () {
      await expect(
        escrow.connect(other).releaseFunds(escrowId),
      ).to.be.revertedWith("Not a party");
    });

    it("Should reject if already released", async function () {
      await escrow.connect(partyA).releaseFunds(escrowId);
      await expect(
        escrow.connect(partyA).releaseFunds(escrowId),
      ).to.be.revertedWith("Wrong status");
    });
  });

  describe("raiseDispute", function () {
    let escrowId;

    beforeEach(async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      await escrow
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, []);
      escrowId = 0;
    });

    it("PartyA should be able to raise dispute", async function () {
      const reason = "Deliverables not met";
      await escrow.connect(partyA).raiseDispute(escrowId, reason);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(2); // DISPUTED
    });

    it("PartyB should be able to raise dispute", async function () {
      const reason = "Payment issue";
      await escrow.connect(partyB).raiseDispute(escrowId, reason);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(2); // DISPUTED
    });

    it("Should emit DisputeRaised event with reason", async function () {
      const reason = "Deliverables not met";

      const tx = await escrow.connect(partyA).raiseDispute(escrowId, reason);
      await expect(tx)
        .to.emit(escrow, "DisputeRaised")
        .withArgs(escrowId, partyA.address, reason, expect.anything());
    });

    it("Non-party should NOT be able to raise dispute", async function () {
      await expect(
        escrow.connect(other).raiseDispute(escrowId, "Some reason"),
      ).to.be.revertedWith("Not a party");
    });

    it("Should reject empty reason", async function () {
      await expect(
        escrow.connect(partyA).raiseDispute(escrowId, ""),
      ).to.be.revertedWith("Reason required");
    });

    it("Should reject if already disputed", async function () {
      await escrow.connect(partyA).raiseDispute(escrowId, "First dispute");

      await expect(
        escrow.connect(partyB).raiseDispute(escrowId, "Second dispute"),
      ).to.be.revertedWith("Wrong status");
    });
  });

  describe("resolveDispute", function () {
    let escrowId;

    beforeEach(async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      await escrow
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, []);
      escrowId = 0;

      await escrow.connect(partyA).raiseDispute(escrowId, "Dispute reason");
    });

    it("Owner should resolve dispute in favor of partyA", async function () {
      await escrow.connect(owner).resolveDispute(escrowId, false);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(1); // RELEASED
    });

    it("Owner should resolve dispute in favor of partyB", async function () {
      await escrow.connect(owner).resolveDispute(escrowId, true);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(1); // RELEASED
    });

    it("Should transfer funds to winner (partyA)", async function () {
      const expectedFee = (AMOUNT * BigInt(FEE_BPS)) / BigInt(10000);
      const expectedPayout = AMOUNT - expectedFee;

      const balanceBefore = await mockUSDC.balanceOf(partyA.address);
      await escrow.connect(owner).resolveDispute(escrowId, false);
      const balanceAfter = await mockUSDC.balanceOf(partyA.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedPayout);
    });

    it("Should transfer funds to winner (partyB)", async function () {
      const expectedFee = (AMOUNT * BigInt(FEE_BPS)) / BigInt(10000);
      const expectedPayout = AMOUNT - expectedFee;

      const balanceBefore = await mockUSDC.balanceOf(partyB.address);
      await escrow.connect(owner).resolveDispute(escrowId, true);
      const balanceAfter = await mockUSDC.balanceOf(partyB.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedPayout);
    });

    it("Should emit DisputeResolved event with resolver", async function () {
      const expectedFee = (AMOUNT * BigInt(FEE_BPS)) / BigInt(10000);
      const expectedPayout = AMOUNT - expectedFee;

      await expect(escrow.connect(owner).resolveDispute(escrowId, false))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(
          escrowId,
          partyA.address,
          expectedPayout,
          owner.address,
          expect.anything(),
        );
    });

    it("Non-owner should NOT be able to resolve dispute", async function () {
      await expect(
        escrow.connect(partyA).resolveDispute(escrowId, false),
      ).to.be.revertedWith("Not owner");
    });

    it("Should reject resolving non-disputed escrow", async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      await escrow
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, []);
      const newEscrowId = 1;

      await expect(
        escrow.connect(owner).resolveDispute(newEscrowId, false),
      ).to.be.revertedWith("Wrong status");
    });

    it("Should prevent double resolution", async function () {
      await escrow.connect(owner).resolveDispute(escrowId, false);

      await expect(
        escrow.connect(owner).resolveDispute(escrowId, true),
      ).to.be.revertedWith("Wrong status");
    });
  });

  describe("cancelEscrow", function () {
    let escrowId;

    beforeEach(async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      await escrow
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, []);
      escrowId = 0;
    });

    it("Owner should be able to cancel locked escrow", async function () {
      await escrow.connect(owner).cancelEscrow(escrowId);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(3); // CANCELLED
    });

    it("Should refund partyB on cancel", async function () {
      const balanceBefore = await mockUSDC.balanceOf(partyB.address);
      await escrow.connect(owner).cancelEscrow(escrowId);
      const balanceAfter = await mockUSDC.balanceOf(partyB.address);

      expect(balanceAfter - balanceBefore).to.equal(AMOUNT);
    });

    it("Should emit EscrowCancelled event", async function () {
      await expect(escrow.connect(owner).cancelEscrow(escrowId))
        .to.emit(escrow, "EscrowCancelled")
        .withArgs(escrowId);
    });

    it("Non-owner should NOT be able to cancel", async function () {
      await expect(
        escrow.connect(partyA).cancelEscrow(escrowId),
      ).to.be.revertedWith("Not owner");
    });

    it("Should reject cancelling released escrow", async function () {
      await escrow.connect(partyA).releaseFunds(escrowId);

      await expect(
        escrow.connect(owner).cancelEscrow(escrowId),
      ).to.be.revertedWith("Cannot cancel");
    });
  });

  describe("releaseMilestone", function () {
    let escrowId;

    beforeEach(async function () {
      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test terms"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      const milestone1 = ethers.parseUnits("600", 6);
      const milestone2 = ethers.parseUnits("400", 6);

      await escrow
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, [
          milestone1,
          milestone2,
        ]);
      escrowId = 0;
    });

    it("PartyA should release milestone", async function () {
      await escrow.connect(partyA).releaseMilestone(escrowId, 0);

      // Check event (implicit through no revert)
      // Note: We'd need to add a way to query milestone status in actual contract
    });

    it("Should transfer milestone amount to partyA minus fee", async function () {
      const milestone1 = ethers.parseUnits("600", 6);
      const expectedFee = (milestone1 * BigInt(FEE_BPS)) / BigInt(10000);
      const expectedPayout = milestone1 - expectedFee;

      const balanceBefore = await mockUSDC.balanceOf(partyA.address);
      await escrow.connect(partyA).releaseMilestone(escrowId, 0);
      const balanceAfter = await mockUSDC.balanceOf(partyA.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedPayout);
    });

    it("Should reject already released milestone", async function () {
      await escrow.connect(partyA).releaseMilestone(escrowId, 0);

      await expect(
        escrow.connect(partyA).releaseMilestone(escrowId, 0),
      ).to.be.revertedWith("Already released");
    });

    it("Should reject invalid milestone index", async function () {
      await expect(
        escrow.connect(partyA).releaseMilestone(escrowId, 5),
      ).to.be.revertedWith("Invalid milestone");
    });
  });

  describe("Fee calculation", function () {
    it("Should correctly calculate with different fees", async function () {
      const MockUSDC2 = await ethers.getContractFactory("MockUSDC");
      const usdc2 = await MockUSDC2.deploy();
      await usdc2.mint(partyB.address, ethers.parseUnits("10000", 6));

      const TrustLinkEscrow2 =
        await ethers.getContractFactory("TrustLinkEscrow");
      const escrow2 = await TrustLinkEscrow2.deploy(usdc2, feeRecipient, 500); // 5%

      await usdc2
        .connect(partyB)
        .approve(escrow2, ethers.parseUnits("10000", 6));

      const termsHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      await escrow2
        .connect(partyB)
        .lockFunds(partyA.address, AMOUNT, termsHash, deadline, []);

      const expectedFee = (AMOUNT * BigInt(500)) / BigInt(10000);
      const expectedPayout = AMOUNT - expectedFee;

      const balanceBefore = await usdc2.balanceOf(partyA.address);
      await escrow2.connect(partyA).releaseFunds(0);
      const balanceAfter = await usdc2.balanceOf(partyA.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedPayout);
    });
  });
});
