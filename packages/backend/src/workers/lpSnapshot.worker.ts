import { Prisma, type PrismaClient } from '@prisma/client';
import { createPublicClient, getAddress, http, zeroAddress } from 'viem';
import { PriorityPassSource } from '@pop-box/shared';
import { env } from '../config/env.js';
import { PANCAKE_V3_NPM_ABI, PANCAKE_V3_POOL_ABI } from '../lib/abis.js';

const MIN_LP_BNB_THRESHOLD = new Prisma.Decimal('0.5');
const CONSECUTIVE_QUALIFIED_DAYS = 7;

/**
 * Daily PancakeSwap V3 $POP/BNB active in-range LP snapshot job.
 * Users maintaining >= 0.5 BNB in-range liquidity for 7 consecutive days
 * automatically receive next-season whale whitelist + PriorityPass.
 */
export class LpSnapshotJob {
  private readonly client = createPublicClient({
    transport: http(env.BSC_RPC_URL),
  });

  constructor(private readonly prisma: PrismaClient) {}

  async runOnce(): Promise<{ snapshotted: number; passesGranted: number }> {
    if (
      env.PANCAKE_V3_POOL_ADDRESS === zeroAddress ||
      env.PANCAKE_V3_NPM_ADDRESS === zeroAddress ||
      env.POP_TOKEN_ADDRESS === zeroAddress
    ) {
      return { snapshotted: 0, passesGranted: 0 };
    }

    const slot0 = await this.client.readContract({
      address: env.PANCAKE_V3_POOL_ADDRESS as `0x${string}`,
      abi: PANCAKE_V3_POOL_ABI,
      functionName: 'slot0',
    });
    const currentTick = Number(slot0[1]);

    const users = await this.prisma.user.findMany({
      where: { walletAddress: { not: null } },
      select: { id: true, walletAddress: true },
    });

    const today = new Date().toISOString().slice(0, 10);
    const popAddr = env.POP_TOKEN_ADDRESS.toLowerCase();
    let snapshotted = 0;
    let passesGranted = 0;

    const latestSeason = await this.prisma.season.findFirst({ orderBy: { id: 'desc' } });
    const nextSeasonId = latestSeason ? latestSeason.id + 1 : 2;
    const nextSeasonExists = await this.prisma.season.findUnique({ where: { id: nextSeasonId } });

    for (const user of users) {
      if (!user.walletAddress) continue;
      const owner = getAddress(user.walletAddress);

      const nftCount = await this.client.readContract({
        address: env.PANCAKE_V3_NPM_ADDRESS as `0x${string}`,
        abi: PANCAKE_V3_NPM_ABI,
        functionName: 'balanceOf',
        args: [owner],
      });

      let inRangeLiquiditySum = 0n;
      for (let i = 0n; i < nftCount; i++) {
        const tokenId = await this.client.readContract({
          address: env.PANCAKE_V3_NPM_ADDRESS as `0x${string}`,
          abi: PANCAKE_V3_NPM_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [owner, i],
        });
        const pos = await this.client.readContract({
          address: env.PANCAKE_V3_NPM_ADDRESS as `0x${string}`,
          abi: PANCAKE_V3_NPM_ABI,
          functionName: 'positions',
          args: [tokenId],
        });

        const token0 = pos[2].toLowerCase();
        const token1 = pos[3].toLowerCase();
        const tickLower = Number(pos[5]);
        const tickUpper = Number(pos[6]);
        const liquidity = pos[7];

        const isPopPool = token0 === popAddr || token1 === popAddr;
        const isInRange = currentTick >= tickLower && currentTick < tickUpper;
        if (isPopPool && isInRange && liquidity > 0n) {
          inRangeLiquiditySum += liquidity;
        }
      }

      // Approximate BNB value from active liquidity (exact valuation can be plugged from subgraph/oracle)
      const bnbValue =
        inRangeLiquiditySum > 0n
          ? new Prisma.Decimal(inRangeLiquiditySum.toString()).div(new Prisma.Decimal('1e18'))
          : new Prisma.Decimal(0);
      const qualified = bnbValue.gte(MIN_LP_BNB_THRESHOLD);

      await this.prisma.lpSnapshot.upsert({
        where: {
          walletAddress_snapshotDate: {
            walletAddress: owner,
            snapshotDate: today,
          },
        },
        create: {
          walletAddress: owner,
          snapshotDate: today,
          bnbValue,
          qualified,
        },
        update: {
          bnbValue,
          qualified,
        },
      });
      snapshotted++;

      if (qualified && nextSeasonExists) {
        const recent7 = await this.prisma.lpSnapshot.findMany({
          where: { walletAddress: owner },
          orderBy: { snapshotDate: 'desc' },
          take: CONSECUTIVE_QUALIFIED_DAYS,
        });
        if (
          recent7.length === CONSECUTIVE_QUALIFIED_DAYS &&
          recent7.every((r) => r.qualified)
        ) {
          await this.prisma.priorityPass.upsert({
            where: {
              userId_forSeasonId: { userId: user.id, forSeasonId: nextSeasonId },
            },
            create: {
              userId: user.id,
              forSeasonId: nextSeasonId,
              source: PriorityPassSource.LP_SNAPSHOT,
            },
            update: {},
          });
          passesGranted++;
        }
      }
    }

    return { snapshotted, passesGranted };
  }
}
