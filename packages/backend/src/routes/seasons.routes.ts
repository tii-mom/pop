import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createPublicClient, formatEther, http, zeroAddress } from 'viem';
import { PANCAKESWAP_V3_INIT_SPEC, SEASON_1_TIERS } from '@pop-box/shared';
import { env } from '../config/env.js';
import { POP_PRIMARY_SALE_ABI } from '../lib/abis.js';
import { AddressMerkleTree } from '../services/merkle.service.js';
import { requireAuth } from '../middleware/auth.js';

export async function registerSeasonRoutes(
  app: FastifyInstance,
  deps: { prisma: PrismaClient }
): Promise<void> {
  const { prisma } = deps;

  // GET /api/v1/seasons/current
  app.get('/seasons/current', async (_request, reply) => {
    const season = await prisma.season.findFirst({
      orderBy: { id: 'desc' },
    });
    if (!season) {
      return reply.code(404).send({ error: 'NO_ACTIVE_SEASON' });
    }

    const tierCounts = await prisma.blindBox.groupBy({
      by: ['tierId', 'status'],
      where: { seasonId: season.id },
      _count: { _all: true },
    });

    return {
      id: season.id,
      status: season.status,
      targetBnb: season.targetBnb.toString(),
      totalPopAllocated: season.totalPopAllocated.toString(),
      refPriceBnb: season.refPriceBnb.toString(),
      poolCommitHash: season.poolCommitHash,
      priorityStartAt: season.priorityStartAt.toISOString(),
      publicStartAt: season.publicStartAt.toISOString(),
      endAt: season.endAt.toISOString(),
      tiers: SEASON_1_TIERS,
      tierStats: tierCounts,
      pancakeV3Spec: PANCAKESWAP_V3_INIT_SPEC,
    };
  });

  // GET /api/v1/seasons/:id/proof
  app.get('/seasons/:id/proof', { preHandler: requireAuth }, async (request, reply) => {
    const seasonId = Number((request.params as { id: string }).id);
    if (!Number.isInteger(seasonId) || seasonId <= 0) {
      return reply.code(400).send({ error: 'INVALID_SEASON_ID' });
    }

    const user = await prisma.user.findUnique({ where: { id: request.authUser!.sub } });
    if (!user?.walletAddress) {
      return reply.code(400).send({ error: 'WALLET_NOT_BOUND' });
    }

    const priorityPasses = await prisma.priorityPass.findMany({
      where: { forSeasonId: seasonId },
      include: { user: { select: { walletAddress: true } } },
    });
    const priorityAddresses = priorityPasses
      .map((p) => p.user.walletAddress)
      .filter((a): a is string => Boolean(a));

    const whaleUsers = await prisma.user.findMany({
      where: {
        walletAddress: { not: null },
        OR: [
          { xFollowers: { gte: 1000 } },
          { AND: [{ squareVerified: true }, { squareFollowers: { gte: 1000 } }] },
          { tgGroups: { some: { whitelistGranted: true } } },
        ],
      },
      select: { walletAddress: true },
    });
    const whaleAddresses = whaleUsers
      .map((u) => u.walletAddress)
      .filter((a): a is string => Boolean(a));

    const priorityTree = new AddressMerkleTree(priorityAddresses);
    const whaleTree = new AddressMerkleTree(whaleAddresses);

    const priorityProof = priorityTree.getProof(user.walletAddress);
    const whaleProof = whaleTree.getProof(user.walletAddress);

    return {
      seasonId,
      walletAddress: user.walletAddress,
      priorityEligible: priorityProof.length > 0 || priorityAddresses.includes(user.walletAddress),
      priorityProof,
      whaleEligible: whaleProof.length > 0 || whaleAddresses.includes(user.walletAddress),
      whaleProof,
    };
  });

  // GET /api/v1/seasons/transparency
  app.get('/seasons/transparency', async () => {
    const season = await prisma.season.findFirst({ orderBy: { id: 'desc' } });

    const [dbSoldCount, userTotals] = await Promise.all([
      season
        ? prisma.blindBox.count({
            where: { seasonId: season.id, status: { not: 'UNSOLD' } },
          })
        : Promise.resolve(0),
      prisma.user.aggregate({
        _sum: {
          bnbAvailable: true,
          bnbLocked: true,
          popAvailable: true,
          popPendingClaim: true,
          popClaimedTotal: true,
        },
      }),
    ]);

    let onChainSoldTotal: number | null = null;
    let hotCustodyBnbBalance: string | null = null;

    if (
      env.POP_PRIMARY_SALE_ADDRESS !== zeroAddress &&
      env.HOT_CUSTODY_WALLET_ADDRESS !== zeroAddress
    ) {
      try {
        const client = createPublicClient({ transport: http(env.BSC_RPC_URL) });
        if (season) {
          const tierResults = await Promise.all(
            [0, 1, 2].map((tierId) =>
              client.readContract({
                address: env.POP_PRIMARY_SALE_ADDRESS as `0x${string}`,
                abi: POP_PRIMARY_SALE_ABI,
                functionName: 'tiers',
                args: [BigInt(season.id), tierId],
              })
            )
          );
          onChainSoldTotal = tierResults.reduce((acc, t) => acc + Number(t[3]), 0);
        }
        const bal = await client.getBalance({
          address: env.HOT_CUSTODY_WALLET_ADDRESS as `0x${string}`,
        });
        hotCustodyBnbBalance = formatEther(bal);
      } catch {
        // RPC unavailable in offline environment; keep null gracefully
      }
    }

    const totalUserBnb = (userTotals._sum.bnbAvailable ?? 0)
      .toString();
    const totalUserBnbLocked = (userTotals._sum.bnbLocked ?? 0).toString();

    return {
      seasonId: season?.id ?? null,
      poolCommitHash: season?.poolCommitHash ?? null,
      boxes: {
        dbSoldCount,
        onChainSoldTotal,
        inSync: onChainSoldTotal === null ? null : dbSoldCount === onChainSoldTotal,
      },
      custody: {
        hotCustodyWallet: env.HOT_CUSTODY_WALLET_ADDRESS,
        hotCustodyBnbBalance,
        totalUserBnbAvailable: totalUserBnb,
        totalUserBnbLocked,
      },
      popLiability: {
        popAvailable: (userTotals._sum.popAvailable ?? 0).toString(),
        popPendingClaim: (userTotals._sum.popPendingClaim ?? 0).toString(),
        popClaimedTotal: (userTotals._sum.popClaimedTotal ?? 0).toString(),
      },
    };
  });
}
