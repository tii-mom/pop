import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getAddress } from 'viem';
import { z } from 'zod';
import { env } from '../config/env.js';
import type { KVStore } from '../lib/redis.js';
import type { PrismaClient } from '@prisma/client';
import {
  buildSiweMessage,
  signJwt,
  verifyTelegramInitData,
  verifyWalletSignature,
} from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.js';

export interface AuthRoutesDeps {
  prisma: PrismaClient;
  kv: KVStore;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthRoutesDeps
): Promise<void> {
  const { prisma, kv } = deps;

  // GET /api/v1/auth/nonce?address=0x...
  app.get('/auth/nonce', async (request, reply) => {
    const query = z
      .object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({ error: 'INVALID_ADDRESS' });
    }

    const address = getAddress(query.data.address);
    const nonce = crypto.randomBytes(16).toString('hex');
    await kv.set(`auth:nonce:${address.toLowerCase()}`, nonce, 300);

    return {
      address,
      nonce,
      message: buildSiweMessage(address, nonce),
    };
  });

  // POST /api/v1/auth/wallet-login
  app.post('/auth/wallet-login', async (request, reply) => {
    const body = z
      .object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
        referrerId: z.string().optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD', details: body.error.flatten() });
    }

    const address = getAddress(body.data.address);
    const nonceKey = `auth:nonce:${address.toLowerCase()}`;
    const nonce = await kv.get(nonceKey);
    if (!nonce) {
      return reply.code(401).send({ error: 'NONCE_EXPIRED' });
    }

    const message = buildSiweMessage(address, nonce);
    const valid = await verifyWalletSignature(
      address,
      message,
      body.data.signature as `0x${string}`
    );
    if (!valid) {
      return reply.code(401).send({ error: 'INVALID_SIGNATURE' });
    }

    await kv.del(nonceKey);

    let user = await prisma.user.findUnique({ where: { walletAddress: address } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          walletAddress: address,
          referrerId: body.data.referrerId,
        },
      });
    }

    const token = signJwt(
      { sub: user.id, walletAddress: user.walletAddress, telegramId: user.telegramId },
      env.JWT_SECRET
    );

    return { token, userId: user.id, walletAddress: user.walletAddress };
  });

  // POST /api/v1/auth/telegram-login (0U users can take quizzes without a wallet)
  app.post('/auth/telegram-login', async (request, reply) => {
    const body = z
      .object({
        initData: z.string().min(10),
        referrerId: z.string().optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD' });
    }

    const verified = verifyTelegramInitData(body.data.initData, env.TELEGRAM_BOT_TOKEN);
    if (!verified.valid || !verified.user) {
      return reply.code(401).send({ error: 'INVALID_TELEGRAM_INIT_DATA' });
    }

    const telegramId = String(verified.user.id);
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          telegramUsername: verified.user.username ?? null,
          referrerId: body.data.referrerId,
        },
      });
    } else if (verified.user.username && user.telegramUsername !== verified.user.username) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { telegramUsername: verified.user.username },
      });
    }

    const token = signJwt(
      { sub: user.id, walletAddress: user.walletAddress, telegramId: user.telegramId },
      env.JWT_SECRET
    );

    return { token, userId: user.id, telegramId: user.telegramId };
  });

  // POST /api/v1/users/bind-wallet
  app.post('/users/bind-wallet', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD' });
    }

    const address = getAddress(body.data.address);
    const nonceKey = `auth:nonce:${address.toLowerCase()}`;
    const nonce = await kv.get(nonceKey);
    if (!nonce) {
      return reply.code(401).send({ error: 'NONCE_EXPIRED' });
    }

    const valid = await verifyWalletSignature(
      address,
      buildSiweMessage(address, nonce),
      body.data.signature as `0x${string}`
    );
    if (!valid) {
      return reply.code(401).send({ error: 'INVALID_SIGNATURE' });
    }
    await kv.del(nonceKey);

    const conflict = await prisma.user.findUnique({ where: { walletAddress: address } });
    if (conflict && conflict.id !== request.authUser!.sub) {
      return reply.code(409).send({ error: 'WALLET_ALREADY_BOUND' });
    }

    const updated = await prisma.user.update({
      where: { id: request.authUser!.sub },
      data: { walletAddress: address },
    });

    return { userId: updated.id, walletAddress: updated.walletAddress };
  });

  // POST /api/v1/users/bind-x
  app.post('/users/bind-x', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        xUserId: z.string().min(1),
        xUsername: z.string().min(1).max(32),
        xFollowers: z.number().int().min(0).default(0),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD' });
    }

    const conflict = await prisma.user.findUnique({ where: { xUserId: body.data.xUserId } });
    if (conflict && conflict.id !== request.authUser!.sub) {
      return reply.code(409).send({ error: 'X_ACCOUNT_ALREADY_BOUND' });
    }

    const updated = await prisma.user.update({
      where: { id: request.authUser!.sub },
      data: {
        xUserId: body.data.xUserId,
        xUsername: body.data.xUsername.replace(/^@/, ''),
        xFollowers: body.data.xFollowers,
      },
    });

    return {
      userId: updated.id,
      xUserId: updated.xUserId,
      xUsername: updated.xUsername,
      xFollowers: updated.xFollowers,
    };
  });

  // POST /api/v1/users/verify-square
  app.post('/users/verify-square', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        binanceSquareUrl: z
          .string()
          .url()
          .refine((u) => /^https:\/\/(www\.)?binance\.com\/.*square/i.test(u), {
            message: 'Must be a valid Binance Square profile URL',
          }),
        squareFollowers: z.number().int().min(0).default(0),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_SQUARE_URL', details: body.error.flatten() });
    }

    const updated = await prisma.user.update({
      where: { id: request.authUser!.sub },
      data: {
        binanceSquareUrl: body.data.binanceSquareUrl,
        squareFollowers: body.data.squareFollowers,
        squareVerified: true,
      },
    });

    return {
      userId: updated.id,
      binanceSquareUrl: updated.binanceSquareUrl,
      squareFollowers: updated.squareFollowers,
      squareVerified: updated.squareVerified,
    };
  });

  // GET /api/v1/users/me
  app.get('/users/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.authUser!.sub },
      include: {
        priorityPasses: { select: { forSeasonId: true, source: true } },
        tgGroups: { where: { whitelistGranted: true }, select: { chatId: true } },
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    }

    const isWhaleWhitelisted =
      user.xFollowers >= 1000 ||
      (user.squareVerified && user.squareFollowers >= 1000) ||
      user.tgGroups.length > 0;

    return {
      id: user.id,
      walletAddress: user.walletAddress,
      telegramId: user.telegramId,
      telegramUsername: user.telegramUsername,
      xUsername: user.xUsername,
      xFollowers: user.xFollowers,
      binanceSquareUrl: user.binanceSquareUrl,
      squareFollowers: user.squareFollowers,
      squareVerified: user.squareVerified,
      bnbAvailable: user.bnbAvailable.toString(),
      bnbLocked: user.bnbLocked.toString(),
      popAvailable: user.popAvailable.toString(),
      popPendingClaim: user.popPendingClaim.toString(),
      popClaimedTotal: user.popClaimedTotal.toString(),
      riskLevel: user.riskLevel,
      hasPriorityPass: user.priorityPasses.length > 0,
      priorityPasses: user.priorityPasses,
      isWhaleWhitelisted,
    };
  });
}
