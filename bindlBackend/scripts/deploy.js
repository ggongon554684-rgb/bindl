import hardhat from "hardhat";
const { ethers } = hardhat;
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTOCOL_FEE_BPS = 200;
const MINT_AMOUNT_USDC = 10_000;
const ENV_PATH = path.resolve(__dirname, "../.env");

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

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("  ║    bindl — Base Sepolia Deploy           ║");
  console.log("  ╚══════════════════════════════════════════╝\n");
  console.log(`Deployer    : ${deployer.address}`);
  console.log(`FeeRecipient: ${deployer.address}`);
  console.log(
    `Fee         : ${PROTOCOL_FEE_BPS} bps (${PROTOCOL_FEE_BPS / 100}%)\n`,
  );

  // 1. Deploy MockUSDC
  console.log("📦 Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log(`   ✅ MockUSDC deployed at: ${usdcAddress}`);

  // 2. Deploy TrustLinkEscrow
  console.log("\n📦 Deploying TrustLinkEscrow...");
  const TrustLinkEscrow = await ethers.getContractFactory("TrustLinkEscrow");
  const escrow = await TrustLinkEscrow.deploy(
    usdcAddress,
    deployer.address,
    PROTOCOL_FEE_BPS,
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`   ✅ TrustLinkEscrow deployed at: ${escrowAddress}`);

  // 3. Mint test USDC to deployer only
  console.log("\n💰 Minting test USDC to deployer...");
  const mintAmount = ethers.parseUnits(String(MINT_AMOUNT_USDC), 6);
  const tx = await usdc.mint(deployer.address, mintAmount);
  await tx.wait();
  console.log(`   Deployer: ${deployer.address} → ${MINT_AMOUNT_USDC} USDC`);

  // 4. Update .env
  console.log("\n📝 Updating .env...");
  updateEnv("CONTRACT_ADDRESS", escrowAddress);
  updateEnv("MOCK_USDC_ADDRESS", usdcAddress);
  updateEnv("FEE_RECIPIENT", deployer.address);
  console.log(`   CONTRACT_ADDRESS  = ${escrowAddress}`);
  console.log(`   MOCK_USDC_ADDRESS = ${usdcAddress}`);
  console.log(`   FEE_RECIPIENT     = ${deployer.address}`);

  // 5. Print frontend values
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   Copy these to your frontend .env.local ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`NEXT_PUBLIC_ESCROW_ADDRESS=${escrowAddress}`);
  console.log(`NEXT_PUBLIC_MOCK_USDC_ADDRESS=${usdcAddress}`);
  console.log(`NEXT_PUBLIC_CHAIN_ID=84532`);
  console.log(`NEXT_PUBLIC_API_URL=http://localhost:8000`);

  console.log("\n✅ Deploy complete!\n");
}

main().catch((err) => {
  console.error("❌ Deploy failed:", err);
  process.exitCode = 1;
});
