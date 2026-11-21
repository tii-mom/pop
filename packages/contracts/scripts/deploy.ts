import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

function requireAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value) || value === ethers.ZeroAddress) {
    throw new Error(`Missing or invalid address env var: ${name}`);
  }
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying POP Box contracts with:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  const teamReserveWallet = requireAddress("TEAM_RESERVE_WALLET");
  const lpDeployWallet = requireAddress("LP_DEPLOY_WALLET");
  const marketingWallet = requireAddress("MARKETING_WALLET");
  const ecosystemWallet = requireAddress("ECOSYSTEM_WALLET");
  const reserveWallet = requireAddress("RESERVE_WALLET");
  const claimSignerWallet = requireAddress("CLAIM_SIGNER_WALLET");

  const maxClaimPerTxPop = BigInt(process.env.MAX_CLAIM_PER_TX_POP || "1500000");
  const dailyClaimLimitPop = BigInt(process.env.DAILY_CLAIM_LIMIT_POP || "10000000");

  // 1. Deploy PopToken (1,000,000,000 $POP fixed supply)
  const PopToken = await ethers.getContractFactory("PopToken");
  const popToken = await PopToken.deploy(
    lpDeployWallet,
    teamReserveWallet,
    marketingWallet,
    ecosystemWallet
  );
  await popToken.waitForDeployment();
  const popTokenAddr = await popToken.getAddress();
  console.log("PopToken deployed at:", popTokenAddr);

  // 2. Deploy PopPrimarySale (owner = TEAM_RESERVE_WALLET, or deployer initially if initializing Season 1 right away)
  const saleOwner = process.env.INITIAL_OWNER_IS_DEPLOYER === "true" ? deployer.address : teamReserveWallet;
  const PopPrimarySale = await ethers.getContractFactory("PopPrimarySale");
  const primarySale = await PopPrimarySale.deploy(
    saleOwner,
    lpDeployWallet,
    reserveWallet,
    teamReserveWallet
  );
  await primarySale.waitForDeployment();
  const primarySaleAddr = await primarySale.getAddress();
  console.log("PopPrimarySale deployed at:", primarySaleAddr, "(owner:", saleOwner, ")");

  // 3. Deploy PopClaimVault
  const PopClaimVault = await ethers.getContractFactory("PopClaimVault");
  const claimVault = await PopClaimVault.deploy(
    teamReserveWallet,
    popTokenAddr,
    claimSignerWallet,
    maxClaimPerTxPop * 10n ** 18n,
    dailyClaimLimitPop * 10n ** 18n
  );
  await claimVault.waitForDeployment();
  const claimVaultAddr = await claimVault.getAddress();
  console.log("PopClaimVault deployed at:", claimVaultAddr, "(owner:", teamReserveWallet, ")");

  console.log("\n=== Deployment Summary ===");
  console.log(
    JSON.stringify(
      {
        network: (await ethers.provider.getNetwork()).name,
        chainId: Number((await ethers.provider.getNetwork()).chainId),
        PopToken: popTokenAddr,
        PopPrimarySale: primarySaleAddr,
        PopClaimVault: claimVaultAddr,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
