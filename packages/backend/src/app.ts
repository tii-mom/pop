import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import { env } from './config/env.js';
import { prisma as defaultPrisma } from './lib/prisma.js';
import { createRedisClient, MemoryKVStore, RedisKVStore, type KVStore } from './lib/redis.js';
import { InsufficientBalanceError, LedgerService } from './services/ledger.service.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerSeasonRoutes } from './routes/seasons.routes.js';
import { registerBoxRoutes } from './routes/boxes.routes.js';
import { registerOpenRoutes } from './routes/open.routes.js';
import { registerMarketRoutes } from './routes/market.routes.js';
import { registerWalletRoutes } from './routes/wallet.routes.js';

export interface BuildAppOptions {
  prisma?: PrismaClient;
  kv?: KVStore;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
    trustProxy: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  const prisma = options.prisma ?? defaultPrisma;
  const kv =
    options.kv ??
    (env.NODE_ENV === 'test' ? new MemoryKVStore() : new RedisKVStore(createRedisClient()));
  const ledger = new LedgerService(prisma);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof InsufficientBalanceError) {
      return reply.code(400).send({ error: 'INSUFFICIENT_BALANCE', message: error.message });
    }
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const message = error instanceof Error ? error.message : 'Internal server error';
    return reply.code(statusCode).send({ error: 'REQUEST_FAILED', message });
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'pop-box-backend',
    timestamp: new Date().toISOString(),
  }));

  await app.register(
    async (v1) => {
      await registerAuthRoutes(v1, { prisma, kv });
      await registerSeasonRoutes(v1, { prisma });
      await registerBoxRoutes(v1, { prisma, ledger });
      await registerOpenRoutes(v1, { prisma, kv, ledger });
      await registerMarketRoutes(v1, { prisma, ledger });
      await registerWalletRoutes(v1, { prisma, ledger });
    },
    { prefix: '/api/v1' }
  );

  return app;
}
