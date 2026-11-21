import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const saleAddr = process.env.POP_PRIMARY_SALE_ADDRESS;
  if (!saleAddr || !ethers.isAddress(saleAddr)) {
    throw new Error("Missing or invalid POP_PRIMARY_SALE_ADDRESS");
  }

  const poolCommitHash = process.env.SEASON_1_POOL_COMMIT_HASH;
  if (!poolCommitHash || !ethers.isHexString(poolCommitHash, 32)) {
    throw new Error("Missing or invalid 32-byte SEASON_1_POOL_COMMIT_HASH");
  }

  const priorityRoot = process.env.SEASON_1_PRIORITY_MERKLE_ROOT || ethers.ZeroHash;
  const whaleRoot = process.env.SEASON_1_WHALE_MERKLE_ROOT || ethers.ZeroHash;

  const now = Math.floor(Date.now() / 1000);
  const priorityStartAt = Number(process.env.SEASON_1_PRIORITY_START_AT || now + 3600);
  const publicStartAt = Number(process.env.SEASON_1_PUBLIC_START_AT || priorityStartAt + 1800); // +30 min
  const endAt = Number(process.env.SEASON_1_END_AT || publicStartAt + 7 * 86400); // +7 days

  const sale = await ethers.getContractAt("PopPrimarySale", saleAddr);

  console.log("Creating Season 1 on PopPrimarySale:", saleAddr);
  // Season 1 BNB split: 80% lpWallet / 0% reserveWallet / 20% teamWallet
  const txSeason = await sale.createSeason(
    1,
    priorityStartAt,
    publicStartAt,
    endAt,
    8000,
    0,
    2000,
    poolCommitHash,
    priorityRoot,
    whaleRoot
  );
  await txSeason.wait();
  console.log("Season 1 created. tx:", txSeason.hash);

  // Tier 0: Mini Box (0.01 BNB, 2,500 supply, dynamic cap 2..20)
  const tx0 = await sale.configureTier(1, 0, ethers.parseEther("0.01"), 2500, 20, false);
  await tx0.wait();
  console.log("Tier 0 (Mini) configured: 2,500 boxes. tx:", tx0.hash);

  // Tier 1: Pro Box (0.1 BNB, 500 supply, dynamic cap 1..5)
  const tx1 = await sale.configureTier(1, 1, ethers.parseEther("0.1"), 500, 5, false);
  await tx1.wait();
  console.log("Tier 1 (Pro) configured: 500 boxes. tx:", tx1.hash);

  // Tier 2: Whale Box (1.0 BNB, 25 supply, unlocked by 5 on-chain referrals or whalePublicOpen)
  const tx2 = await sale.configureTier(1, 2, ethers.parseEther("1.0"), 25, 1, false);
  await tx2.wait();
  console.log("Tier 2 (Whale) configured: 25 boxes. tx:", tx2.hash);

  console.log("Season 1 initialization complete (3,025 boxes total, 100 BNB cap, 60M $POP).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
