import type { FastifyInstance } from 'fastify';
import {
  AssetType,
  BnbWithdrawalStatus,
  PopClaimStatus,
  Prisma,
  type PrismaClient,
  RiskLevel,
} from '@prisma/client';
import { createPublicClient, getAddress, http, zeroAddress } from 'viem';
import { z } from 'zod';
import {
  BNB_CUSTODY_LIMITS,
  CLAIM_SIGNATURE_TTL_MINUTES,
  LedgerReason,
} from '@pop-box/shared';
import { env } from '../config/env.js';
import { POP_CLAIM_VAULT_ABI } from '../lib/abis.js';
import { LedgerService } from '../services/ledger.service.js';
import { signPopClaimVoucher } from '../services/claimSigner.service.js';
import { requireAuth } from '../middleware/auth.js';

export async function registerWalletRoutes(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; ledger: LedgerService }
): Promise<void> {
  const { prisma, ledger } = deps;

  // GET /api/v1/wallet/deposit-address
  app.get('/wallet/deposit-address', { preHandler: requireAuth }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.authUser!.sub } });
    if (!user?.walletAddress) {
      return reply.code(400).send({
        error: 'WALLET_NOT_BOUND',
        message: 'Bind your BSC wallet first so direct BNB deposits can be credited automatically',
      });
    }

    return {
      depositAddress: env.HOT_CUSTODY_WALLET_ADDRESS,
      expectedFromWallet: user.walletAddress,
      chainId: env.BSC_CHAIN_ID,
      note: 'Send native BNB directly from your bound wallet address; deposits credit automatically after 3 BSC confirmations.',
    };
  });

  // POST /api/v1/wallet/withdraw-bnb
  app.post('/wallet/withdraw-bnb', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        amountBnb: z.string().refine((v) => Number(v) >= BNB_CUSTODY_LIMITS.MIN_WITHDRAW_BNB, {
          message: `Minimum withdrawal is ${BNB_CUSTODY_LIMITS.MIN_WITHDRAW_BNB} BNB`,
        }),
        toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD', details: body.error.flatten() });
    }

    const userId = request.authUser!.sub;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (user.riskLevel === RiskLevel.BANNED) {
      return reply.code(403).send({ error: 'ACCOUNT_BANNED' });
    }

    const toAddress = getAddress(body.data.toAddress ?? user.walletAddress ?? '');
    if (!toAddress || toAddress === zeroAddress) {
      return reply.code(400).send({ error: 'MISSING_DESTINATION_WALLET' });
    }

    const amount = new Prisma.Decimal(body.data.amountBnb);
    const needsManualReview =
      amount.gt(BNB_CUSTODY_LIMITS.AUTO_WITHDRAW_MAX_BNB) ||
      user.riskLevel !== RiskLevel.NORMAL;

    const withdrawal = await ledger.runInTransaction(async (tx) => {
      const record = await tx.bnbWithdrawal.create({
        data: {
          userId,
          amountBnb: amount,
          toAddress,
          status: needsManualReview
            ? BnbWithdrawalStatus.PENDING_REVIEW
            : BnbWithdrawalStatus.PENDING_AUTO,
          riskNotes: needsManualReview
            ? `Review triggered: amount=${amount.toString()} BNB, risk=${user.riskLevel}`
            : null,
        },
      });

      await ledger.moveColumnsInTx(tx, {
        userId,
        asset: AssetType.BNB,
        fromColumn: 'bnbAvailable',
        toColumn: 'bnbLocked',
        amount,
        reason: LedgerReason.BNB_WITHDRAW_LOCK,
        refId: record.id,
        idempotencyKey: `bnb:withdraw:lock:${record.id}`,
      });

      return record;
    });

    return {
      withdrawalId: withdrawal.id,
      amountBnb: withdrawal.amountBnb.toString(),
      toAddress: withdrawal.toAddress,
      status: withdrawal.status,
    };
  });

  // POST /api/v1/wallet/claim-pop/prepare
  app.post('/wallet/claim-pop/prepare', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.sub;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (!user.walletAddress) {
      return reply.code(400).send({ error: 'WALLET_NOT_BOUND' });
    }
    if (user.riskLevel === RiskLevel.HIGH || user.riskLevel === RiskLevel.BANNED) {
      return reply.code(403).send({ error: 'ACCOUNT_UNDER_RISK_REVIEW' });
    }
    if (user.popAvailable.lte(0)) {
      return reply.code(400).send({ error: 'NO_CLAIMABLE_POP' });
    }
    if (!env.CLAIM_SIGNER_PRIVATE_KEY) {
      return reply.code(503).send({ error: 'CLAIM_SIGNER_NOT_CONFIGURED' });
    }

    // Prevent concurrent overlapping signed claims
    const existingSigned = await prisma.popClaim.findFirst({
      where: { userId, status: PopClaimStatus.SIGNED },
    });
    if (existingSigned) {
      return reply.code(409).send({
        error: 'PENDING_CLAIM_EXISTS',
        claimId: existingSigned.id,
        deadline: existingSigned.deadline.toISOString(),
      });
    }

    // Read on-chain nonce from PopClaimVault (fallback to confirmed count if local test)
    let nonce = 0n;
    if (env.POP_CLAIM_VAULT_ADDRESS !== zeroAddress) {
      try {
        const client = createPublicClient({ transport: http(env.BSC_RPC_URL) });
        nonce = await client.readContract({
          address: env.POP_CLAIM_VAULT_ADDRESS as `0x${string}`,
          abi: POP_CLAIM_VAULT_ABI,
          functionName: 'nonces',
          args: [getAddress(user.walletAddress)],
        });
      } catch {
        const confirmedCount = await prisma.popClaim.count({
          where: { userId, status: PopClaimStatus.CONFIRMED },
        });
        nonce = BigInt(confirmedCount);
      }
    }

    const amountPop = user.popAvailable;
    const deadlineUnix = Math.floor(Date.now() / 1000) + CLAIM_SIGNATURE_TTL_MINUTES * 60;
    const deadlineDate = new Date(deadlineUnix * 1000);

    const signed = await signPopClaimVoucher({
      recipient: user.walletAddress,
      amountPop: amountPop.toFixed(18),
      nonce,
      deadlineUnix,
      chainId: env.BSC_CHAIN_ID,
      verifyingContract: env.POP_CLAIM_VAULT_ADDRESS as `0x${string}`,
      signerPrivateKey: env.CLAIM_SIGNER_PRIVATE_KEY as `0x${string}`,
    });

    const claim = await ledger.runInTransaction(async (tx) => {
      const record = await tx.popClaim.create({
        data: {
          userId,
          walletAddress: signed.recipient,
          amountPop,
          nonce,
          deadline: deadlineDate,
          signature: signed.signature,
          status: PopClaimStatus.SIGNED,
        },
      });

      await ledger.moveColumnsInTx(tx, {
        userId,
        asset: AssetType.POP,
        fromColumn: 'popAvailable',
        toColumn: 'popPendingClaim',
        amount: amountPop,
        reason: LedgerReason.POP_CLAIM_LOCK,
        refId: record.id,
        idempotencyKey: `pop:claim:lock:${record.id}`,
      });

      return record;
    });

    return {
      claimId: claim.id,
      walletAddress: claim.walletAddress,
      amountPop: claim.amountPop.toString(),
      amountWei: signed.amountWei.toString(),
      nonce: claim.nonce.toString(),
      deadline: deadlineUnix,
      signature: claim.signature,
      status: claim.status,
      verifyingContract: env.POP_CLAIM_VAULT_ADDRESS,
      chainId: env.BSC_CHAIN_ID,
    };
  });

  // GET /api/v1/wallet/ledger?asset=POP|BNB&limit=50
  app.get('/wallet/ledger', { preHandler: requireAuth }, async (request) => {
    const query = z
      .object({
        asset: z.enum(['BNB', 'POP']).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        userId: request.authUser!.sub,
        ...(query.asset ? { asset: query.asset } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    return {
      entries: entries.map((e) => ({
        id: e.id,
        asset: e.asset,
        direction: e.direction,
        amount: e.amount.toString(),
        balanceAfter: e.balanceAfter.toString(),
        reason: e.reason,
        refId: e.refId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
}
