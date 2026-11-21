import { Queue, Worker } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { createRedisClient } from '../lib/redis.js';
import { LedgerService } from '../services/ledger.service.js';
import { ChainSyncerWorker } from './chainSyncer.worker.js';
import { ExpiryWorker } from './expiry.worker.js';
import { AntiSybilJob } from './antiSybil.worker.js';
import { LpSnapshotJob } from './lpSnapshot.worker.js';

export async function startWorkers(prisma: PrismaClient): Promise<() => Promise<void>> {
  const connection = createRedisClient();
  const ledger = new LedgerService(prisma);

  const chainSyncer = new ChainSyncerWorker(prisma, ledger);
  const expiryWorker = new ExpiryWorker(prisma, ledger);
  const antiSybil = new AntiSybilJob(prisma);
  const lpSnapshot = new LpSnapshotJob(prisma);

  const queue = new Queue('pop-box-jobs', { connection });

  await queue.add('chain-sync', {}, { repeat: { every: 10_000 }, jobId: 'chain-sync' });
  await queue.add('expiry-sweep', {}, { repeat: { every: 60_000 }, jobId: 'expiry-sweep' });
  await queue.add('anti-sybil', {}, { repeat: { pattern: '0 2 * * *' }, jobId: 'anti-sybil' });
  await queue.add('lp-snapshot', {}, { repeat: { pattern: '30 3 * * *' }, jobId: 'lp-snapshot' });

  const worker = new Worker(
    'pop-box-jobs',
    async (job) => {
      switch (job.name) {
        case 'chain-sync':
          return chainSyncer.runOnce();
        case 'expiry-sweep':
          return expiryWorker.runOnce();
        case 'anti-sybil':
          return antiSybil.runOnce();
        case 'lp-snapshot':
          return lpSnapshot.runOnce();
        default:
          return null;
      }
    },
    { connection }
  );

  return async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
  };
}
