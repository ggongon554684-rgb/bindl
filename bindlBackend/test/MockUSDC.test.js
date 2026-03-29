const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockUSDC", function () {
  let mockUSDC;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
  });

  describe("Deployment", function () {
    it("Should have correct name and symbol", async function () {
      expect(await mockUSDC.name()).to.equal("USD Coin (Test)");
      expect(await mockUSDC.symbol()).to.equal("USDC");
    });

    it("Should have 6 decimals", async function () {
      expect(await mockUSDC.decimals()).to.equal(6);
    });

    it("Should have zero total supply initially", async function () {
      expect(await mockUSDC.totalSupply()).to.equal(0);
    });

    it("Should set owner to deployer", async function () {
      expect(await mockUSDC.owner()).to.equal(owner.address);
    });
  });

  describe("Minting", function () {
    it("Owner should be able to mint tokens", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(addr1.address, mintAmount);

      expect(await mockUSDC.balanceOf(addr1.address)).to.equal(mintAmount);
      expect(await mockUSDC.totalSupply()).to.equal(mintAmount);
    });

    it("Owner should be able to mint multiple times", async function () {
      const amount1 = ethers.parseUnits("1000", 6);
      const amount2 = ethers.parseUnits("500", 6);

      await mockUSDC.mint(addr1.address, amount1);
      await mockUSDC.mint(addr1.address, amount2);

      expect(await mockUSDC.balanceOf(addr1.address)).to.equal(
        amount1 + amount2,
      );
      expect(await mockUSDC.totalSupply()).to.equal(amount1 + amount2);
    });

    it("Should emit Transfer event on mint", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      await expect(mockUSDC.mint(addr1.address, mintAmount))
        .to.emit(mockUSDC, "Transfer")
        .withArgs(ethers.ZeroAddress, addr1.address, mintAmount);
    });

    it("Non-owner should NOT be able to mint tokens", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      await expect(
        mockUSDC.connect(addr1).mint(addr1.address, mintAmount),
      ).to.be.revertedWith("Not owner");
    });

    it("Should reject mint to zero address", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      await expect(
        mockUSDC.mint(ethers.ZeroAddress, mintAmount),
      ).to.be.revertedWith("Cannot mint to zero address");
    });

    it("Should reject mint with zero amount", async function () {
      await expect(mockUSDC.mint(addr1.address, 0)).to.be.revertedWith(
        "Amount must be greater than 0",
      );
    });
  });

  describe("Transfer", function () {
    beforeEach(async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(owner.address, mintAmount);
    });

    it("Should transfer tokens correctly", async function () {
      const transferAmount = ethers.parseUnits("100", 6);
      await mockUSDC.transfer(addr1.address, transferAmount);

      expect(await mockUSDC.balanceOf(addr1.address)).to.equal(transferAmount);
      expect(await mockUSDC.balanceOf(owner.address)).to.equal(
        ethers.parseUnits("900", 6),
      );
    });

    it("Should emit Transfer event", async function () {
      const transferAmount = ethers.parseUnits("100", 6);
      await expect(mockUSDC.transfer(addr1.address, transferAmount))
        .to.emit(mockUSDC, "Transfer")
        .withArgs(owner.address, addr1.address, transferAmount);
    });

    it("Should revert if insufficient balance", async function () {
      const transferAmount = ethers.parseUnits("2000", 6);
      await expect(
        mockUSDC.transfer(addr1.address, transferAmount),
      ).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("Approve and TransferFrom", function () {
    beforeEach(async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(owner.address, mintAmount);
    });

    it("Should approve spending", async function () {
      const approveAmount = ethers.parseUnits("500", 6);
      await mockUSDC.approve(addr1.address, approveAmount);

      expect(await mockUSDC.allowance(owner.address, addr1.address)).to.equal(
        approveAmount,
      );
    });

    it("Should emit Approval event", async function () {
      const approveAmount = ethers.parseUnits("500", 6);
      await expect(mockUSDC.approve(addr1.address, approveAmount))
        .to.emit(mockUSDC, "Approval")
        .withArgs(owner.address, addr1.address, approveAmount);
    });

    it("Approved spender should transfer tokens", async function () {
      const approveAmount = ethers.parseUnits("500", 6);
      const transferAmount = ethers.parseUnits("100", 6);

      await mockUSDC.approve(addr1.address, approveAmount);
      await mockUSDC
        .connect(addr1)
        .transferFrom(owner.address, addr2.address, transferAmount);

      expect(await mockUSDC.balanceOf(addr2.address)).to.equal(transferAmount);
      expect(await mockUSDC.allowance(owner.address, addr1.address)).to.equal(
        approveAmount - transferAmount,
      );
    });

    it("Should revert transferFrom without approval", async function () {
      const transferAmount = ethers.parseUnits("100", 6);
      await expect(
        mockUSDC
          .connect(addr1)
          .transferFrom(owner.address, addr2.address, transferAmount),
      ).to.be.revertedWith("Insufficient allowance");
    });

    it("Should revert transferFrom with insufficient allowance", async function () {
      const approveAmount = ethers.parseUnits("50", 6);
      const transferAmount = ethers.parseUnits("100", 6);

      await mockUSDC.approve(addr1.address, approveAmount);
      await expect(
        mockUSDC
          .connect(addr1)
          .transferFrom(owner.address, addr2.address, transferAmount),
      ).to.be.revertedWith("Insufficient allowance");
    });

    it("Should decrease allowance after transferFrom", async function () {
      const approveAmount = ethers.parseUnits("500", 6);
      const transferAmount = ethers.parseUnits("100", 6);

      await mockUSDC.approve(addr1.address, approveAmount);
      await mockUSDC
        .connect(addr1)
        .transferFrom(owner.address, addr2.address, transferAmount);

      expect(await mockUSDC.allowance(owner.address, addr1.address)).to.equal(
        approveAmount - transferAmount,
      );
    });
  });

  describe("Decimal Precision", function () {
    it("Should handle small amounts with 6 decimals", async function () {
      const smallAmount = ethers.parseUnits("0.000001", 6); // 1 smallest unit
      await mockUSDC.mint(addr1.address, smallAmount);

      expect(await mockUSDC.balanceOf(addr1.address)).to.equal(smallAmount);
      expect(await mockUSDC.totalSupply()).to.equal(smallAmount);
    });

    it("Should handle large amounts", async function () {
      const largeAmount = ethers.parseUnits("1000000", 6); // 1 million USDC
      await mockUSDC.mint(addr1.address, largeAmount);

      expect(await mockUSDC.balanceOf(addr1.address)).to.equal(largeAmount);
    });
  });
});
