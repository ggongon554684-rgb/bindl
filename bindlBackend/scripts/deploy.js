/**
 * deploy.js — TrustLink local deployment script (ESM version)
 *
 * Deploys MockUSDC + TrustLinkEscrow to Ganache, then auto-updates your .env
 * with the new contract addresses and mints test USDC to all 10 accounts.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network ganache
 */

import hardhat from "hardhat";
const { ethers } = hardhat;
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config ──────────────────────────────────────────────────────────────────

const PROTOCOL_FEE_BPS = 200; // 2% — must match your .env
const MINT_AMOUNT_USDC = 10_000; // USDC to mint per test account
const ENV_PATH = path.resolve(__dirname, "../.env");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function updateEnv(key, value) {
  let content = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf8")
    : "";
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  fs.writeFileSync(ENV_PATH, content, "utf8");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0]; // Account #0 — your SIGNER_PRIVATE_KEY account
  const feeRecipient = signers[1]; // Account #1 — receives protocol fees

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║     TrustLink — Local Deploy Script      ║");
  console.log("╚══════════════════════════════════════════╝\n");
  console.log(`Deployer    : ${deployer.address}`);
  console.log(`FeeRecipient: ${feeRecipient.address}`);
  console.log(
    `Fee         : ${PROTOCOL_FEE_BPS} bps (${PROTOCOL_FEE_BPS / 100}%)\n`,
  );

  // ── 1. Deploy MockUSDC ────────────────────────────────────────────────────
  console.log("📦 Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log(`   ✅ MockUSDC deployed at: ${usdcAddress}`);

  // ── 2. Deploy TrustLinkEscrow ─────────────────────────────────────────────
  console.log("\n📦 Deploying TrustLinkEscrow...");
  const TrustLinkEscrow = await ethers.getContractFactory("TrustLinkEscrow");
  const escrow = await TrustLinkEscrow.deploy(
    usdcAddress,
    feeRecipient.address,
    PROTOCOL_FEE_BPS,
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`   ✅ TrustLinkEscrow deployed at: ${escrowAddress}`);

  // ── 3. Mint test USDC to all 10 accounts ─────────────────────────────────
  console.log("\n💰 Minting test USDC to all accounts...");
  const mintAmount = ethers.parseUnits(String(MINT_AMOUNT_USDC), 6); // USDC = 6 decimals
  for (let i = 0; i < signers.length; i++) {
    const tx = await usdc.mint(signers[i].address, mintAmount);
    await tx.wait();
    console.log(
      `   Account #${i}: ${signers[i].address} → ${MINT_AMOUNT_USDC} USDC`,
    );
  }

  // ── 4. Update .env automatically ─────────────────────────────────────────
  console.log("\n📝 Updating .env...");
  updateEnv("CONTRACT_ADDRESS", escrowAddress);
  updateEnv("MOCK_USDC_ADDRESS", usdcAddress);
  updateEnv("FEE_RECIPIENT", feeRecipient.address);
  updateEnv(
    "SIGNER_PRIVATE_KEY",
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );
  console.log(`   CONTRACT_ADDRESS  = ${escrowAddress}`);
  console.log(`   MOCK_USDC_ADDRESS = ${usdcAddress}`);
  console.log(`   FEE_RECIPIENT     = ${feeRecipient.address}`);

  // ── 5. Print frontend .env values ─────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   Copy these to your frontend .env.local ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`NEXT_PUBLIC_ESCROW_ADDRESS=${escrowAddress}`);
  console.log(`NEXT_PUBLIC_MOCK_USDC_ADDRESS=${usdcAddress}`);
  console.log(`NEXT_PUBLIC_CHAIN_ID=1337`);
  console.log(`NEXT_PUBLIC_API_URL=http://localhost:8000`);

  console.log(
    "\n✅ Deploy complete! Restart your backend to load the new .env values.\n",
  );
}

main().catch((err) => {
  console.error("❌ Deploy failed:", err);
  process.exitCode = 1;
});
