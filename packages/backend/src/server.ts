import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { createRedisClient, RedisKVStore } from './lib/redis.js';
import { buildApp } from './app.js';
import { startWorkers } from './workers/index.js';
import { createPopTelegramBot } from './bot/telegramBot.js';

async function main() {
  const app = await buildApp({ prisma });

  let stopWorkers: (() => Promise<void>) | null = null;
  if (env.ENABLE_WORKERS) {
    stopWorkers = await startWorkers(prisma);
    app.log.info('Background BullMQ workers started');
  }

  let stopBot: (() => Promise<void>) | null = null;
  if (env.TELEGRAM_BOT_TOKEN) {
    const botKv = new RedisKVStore(createRedisClient());
    const bot = createPopTelegramBot({ prisma, kv: botKv });
    bot.start().catch((err) => app.log.error(err, 'Telegram bot stopped with error'));
    stopBot = async () => {
      await bot.stop();
    };
    app.log.info('Telegram grammY Bot started');
  }

  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`POP Fruit backend listening on http://${env.HOST}:${env.PORT}`);

  const shutdown = async () => {
    app.log.info('Shutting down POP Fruit backend...');
    if (stopBot) await stopBot();
    if (stopWorkers) await stopWorkers();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start POP Fruit backend:', err);
  process.exit(1);
});
