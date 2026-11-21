import {
  AssetType,
  BlindBoxStatus,
  LedgerDirection,
  PopClaimStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { createPublicClient, formatEther, getAddress, http, zeroAddress } from 'viem';
import { LedgerReason } from '@pop-box/shared';
import { env } from '../config/env.js';
import { POP_CLAIM_VAULT_ABI, POP_PRIMARY_SALE_ABI } from '../lib/abis.js';
import { LedgerService } from '../services/ledger.service.js';

const CONFIRMATIONS = 3n;
const MAX_BLOCK_RANGE = 500n;

export class ChainSyncerWorker {
  private readonly client = createPublicClient({
    transport: http(env.BSC_RPC_URL),
  });

  constructor(
    private readonly prisma: PrismaClient,
    private readonly ledger: LedgerService
  ) {}

  async runOnce(): Promise<{ processedToBlock: bigint | null; eventsHandled: number }> {
    if (
      env.POP_PRIMARY_SALE_ADDRESS === zeroAddress &&
      env.POP_CLAIM_VAULT_ADDRESS === zeroAddress &&
      env.HOT_CUSTODY_WALLET_ADDRESS === zeroAddress
    ) {
      return { processedToBlock: null, eventsHandled: 0 };
    }

    const latestBlock = await this.client.getBlockNumber();
    const safeBlock = latestBlock > CONFIRMATIONS ? latestBlock - CONFIRMATIONS : 0n;

    const cursor = await this.prisma.syncCursor.findUnique({ where: { key: 'bsc_main' } });
    const fromBlock = cursor ? cursor.blockNumber + 1n : safeBlock > 20n ? safeBlock - 20n : 0n;
    if (fromBlock > safeBlock) {
      return { processedToBlock: safeBlock, eventsHandled: 0 };
    }

    const toBlock =
      safeBlock - fromBlock > MAX_BLOCK_RANGE ? fromBlock + MAX_BLOCK_RANGE : safeBlock;

    let eventsHandled = 0;

    // 1. Sync PopPrimarySale.BoxPurchased
    if (env.POP_PRIMARY_SALE_ADDRESS !== zeroAddress) {
      const purchaseLogs = await this.client.getLogs({
        address: env.POP_PRIMARY_SALE_ADDRESS as `0x${string}`,
        event: POP_PRIMARY_SALE_ABI[0],
        fromBlock,
        toBlock,
      });

      for (const log of purchaseLogs) {
        const { seasonId, tierId, buyer, quantity, startIndex } = log.args;
        if (
          seasonId === undefined ||
          tierId === undefined ||
          !buyer ||
          quantity === undefined ||
          startIndex === undefined
        ) {
          continue;
        }

        const checksumBuyer = getAddress(buyer);
        const user = await this.prisma.user.upsert({
          where: { walletAddress: checksumBuyer },
          create: { walletAddress: checksumBuyer },
          update: {},
        });

        for (let offset = 0; offset < Number(quantity); offset++) {
          const seqIndex = Number(startIndex) + offset;
          await this.prisma.blindBox.updateMany({
            where: {
              seasonId: Number(seasonId),
              tierId: Number(tierId),
              seqIndex,
              status: BlindBoxStatus.UNSOLD,
            },
            data: {
              status: BlindBoxStatus.SEALED,
              ownerId: user.id,
              purchaseTxHash: log.transactionHash,
              purchaseLogIndex: (log.logIndex ?? 0) * 1000 + offset,
            },
          });
        }
        eventsHandled++;
      }
    }

    // 2. Sync PopClaimVault.PopClaimed
    if (env.POP_CLAIM_VAULT_ADDRESS !== zeroAddress) {
      const claimLogs = await this.client.getLogs({
        address: env.POP_CLAIM_VAULT_ADDRESS as `0x${string}`,
        event: POP_CLAIM_VAULT_ABI[0],
        fromBlock,
        toBlock,
      });

      for (const log of claimLogs) {
        const { recipient, nonce } = log.args;
        if (!recipient || nonce === undefined) continue;

        const checksumRecipient = getAddress(recipient);
        const pendingClaim = await this.prisma.popClaim.findFirst({
          where: {
            walletAddress: checksumRecipient,
            nonce,
            status: PopClaimStatus.SIGNED,
          },
        });
        if (!pendingClaim) continue;

        await this.ledger.runInTransaction(async (tx) => {
          await tx.popClaim.update({
            where: { id: pendingClaim.id },
            data: {
              status: PopClaimStatus.CONFIRMED,
              txHash: log.transactionHash,
            },
          });

          await this.ledger.moveColumnsInTx(tx, {
            userId: pendingClaim.userId,
            asset: AssetType.POP,
            fromColumn: 'popPendingClaim',
            toColumn: 'popClaimedTotal',
            amount: pendingClaim.amountPop,
            reason: LedgerReason.POP_CLAIM_CONFIRM,
            refId: pendingClaim.id,
            idempotencyKey: `pop:claim:confirm:${pendingClaim.id}`,
          });
        });
        eventsHandled++;
      }
    }

    // 3. Scan native BNB deposits to HOT_CUSTODY_WALLET_ADDRESS
    if (env.HOT_CUSTODY_WALLET_ADDRESS !== zeroAddress) {
      const custodyAddr = getAddress(env.HOT_CUSTODY_WALLET_ADDRESS).toLowerCase();
      for (let blk = fromBlock; blk <= toBlock; blk++) {
        const block = await this.client.getBlock({
          blockNumber: blk,
          includeTransactions: true,
        });
        for (const txObj of block.transactions) {
          if (typeof txObj === 'string') continue;
          if (!txObj.to || txObj.to.toLowerCase() !== custodyAddr || txObj.value <= 0n) {
            continue;
          }

          const fromAddr = getAddress(txObj.from);
          const amountBnb = new Prisma.Decimal(formatEther(txObj.value));
          const existing = await this.prisma.bnbDeposit.findUnique({
            where: { txHash: txObj.hash },
          });
          if (existing) continue;

          const matchedUser = await this.prisma.user.findUnique({
            where: { walletAddress: fromAddr },
          });

          await this.ledger.runInTransaction(async (tx) => {
            await tx.bnbDeposit.create({
              data: {
                txHash: txObj.hash,
                fromAddress: fromAddr,
                amountBnb,
                blockNumber: blk,
                creditedUserId: matchedUser?.id ?? null,
              },
            });

            if (matchedUser) {
              await this.ledger.applyInTx(tx, {
                userId: matchedUser.id,
                asset: AssetType.BNB,
                column: 'bnbAvailable',
                direction: LedgerDirection.CREDIT,
                amount: amountBnb,
                reason: LedgerReason.BNB_DEPOSIT,
                refId: txObj.hash,
                idempotencyKey: `bnb:deposit:${txObj.hash}`,
              });
            }
          });
          eventsHandled++;
        }
      }
    }

    await this.prisma.syncCursor.upsert({
      where: { key: 'bsc_main' },
      create: { key: 'bsc_main', blockNumber: toBlock },
      update: { blockNumber: toBlock },
    });

    return { processedToBlock: toBlock, eventsHandled };
  }
}
