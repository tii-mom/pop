import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  AssetType,
  BlindBoxStatus,
  ClickSource,
  LedgerDirection,
  type PrismaClient,
  RiskLevel,
} from '@prisma/client';
import { z } from 'zod';
import {
  BOX_REWARD_SPLIT,
  LedgerReason,
  MIN_READ_DURATION_MS,
  QUIZ_ATTEMPT_TTL_SECONDS,
  QUIZ_TURNSTILE_STREAK_THRESHOLD,
} from '@pop-box/shared';
import type { KVStore } from '../lib/redis.js';
import { LedgerService } from '../services/ledger.service.js';
import { fisherYatesShuffle } from '../services/poolShuffler.service.js';
import { verifyTurnstileToken } from '../services/turnstile.service.js';
import { requireAuth } from '../middleware/auth.js';

interface QuizAttemptRecord {
  userId: string;
  boxId: string;
  questionId: string;
  correctShuffledIndex: number;
  startedAtMs: number;
}

export async function registerOpenRoutes(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; kv: KVStore; ledger: LedgerService }
): Promise<void> {
  const { prisma, kv, ledger } = deps;

  // POST /api/v1/open/:boxId/start
  app.post('/open/:boxId/start', { preHandler: requireAuth }, async (request, reply) => {
    const boxId = (request.params as { boxId: string }).boxId;
    const readerId = request.authUser!.sub;

    const [user, box, existingClick] = await Promise.all([
      prisma.user.findUnique({ where: { id: readerId } }),
      prisma.blindBox.findUnique({
        where: { id: boxId },
        include: { questions: true },
      }),
      prisma.clickLog.findUnique({
        where: { boxId_readerId: { boxId, readerId } },
      }),
    ]);

    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (user.riskLevel === RiskLevel.BANNED) {
      return reply.code(403).send({ error: 'ACCOUNT_BANNED' });
    }
    if (!box || box.status !== BlindBoxStatus.ACTIVE) {
      return reply.code(404).send({ error: 'BOX_NOT_ACTIVE' });
    }
    if (box.expiresAt && box.expiresAt <= new Date()) {
      return reply.code(410).send({ error: 'BOX_EXPIRED' });
    }
    if (box.claimedClicks >= box.maxClicks) {
      return reply.code(410).send({ error: 'BOX_COMPLETED' });
    }
    if (box.ownerId === readerId) {
      return reply.code(400).send({ error: 'CANNOT_OPEN_OWN_BOX' });
    }
    if (existingClick) {
      return reply.code(409).send({ error: 'ALREADY_OPENED' });
    }
    if (box.questions.length === 0) {
      return reply.code(500).send({ error: 'QUIZ_NOT_READY' });
    }

    // Pick 1 random question and shuffle its 3 options
    const picked = box.questions[crypto.randomInt(0, box.questions.length)];
    const rawOptions = picked.optionsJson as string[];
    const indexed = rawOptions.map((text, idx) => ({ text, isCorrect: idx === picked.correctIndex }));
    const shuffled = fisherYatesShuffle(indexed);
    const correctShuffledIndex = shuffled.findIndex((o) => o.isCorrect);

    const attemptToken = crypto.randomBytes(24).toString('hex');
    const attempt: QuizAttemptRecord = {
      userId: readerId,
      boxId: box.id,
      questionId: picked.id,
      correctShuffledIndex,
      startedAtMs: Date.now(),
    };

    await kv.set(`quiz:attempt:${attemptToken}`, JSON.stringify(attempt), QUIZ_ATTEMPT_TTL_SECONDS);

    return {
      attemptToken,
      boxId: box.id,
      targetUrl: box.targetUrl,
      questionText: picked.questionText,
      options: shuffled.map((o) => o.text) as [string, string, string],
      minReadDurationMs: MIN_READ_DURATION_MS,
      requiresTurnstile: user.quizWrongStreak >= QUIZ_TURNSTILE_STREAK_THRESHOLD,
    };
  });

  // POST /api/v1/open/:boxId/submit
  app.post('/open/:boxId/submit', { preHandler: requireAuth }, async (request, reply) => {
    const boxId = (request.params as { boxId: string }).boxId;
    const readerId = request.authUser!.sub;

    const body = z
      .object({
        attemptToken: z.string().min(10),
        selectedIndex: z.number().int().min(0).max(2),
        source: z.enum(['TMA', 'WEB', 'EXT']).default('WEB'),
        tgGroupId: z.string().optional(),
        turnstileToken: z.string().optional(),
        deviceFingerprint: z.string().max(128).optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD', details: body.error.flatten() });
    }

    const attemptKey = `quiz:attempt:${body.data.attemptToken}`;
    const rawAttempt = await kv.get(attemptKey);
    if (!rawAttempt) {
      return reply.code(410).send({ error: 'ATTEMPT_EXPIRED' });
    }

    const attempt = JSON.parse(rawAttempt) as QuizAttemptRecord;
    if (attempt.userId !== readerId || attempt.boxId !== boxId) {
      return reply.code(403).send({ error: 'ATTEMPT_MISMATCH' });
    }

    const readDurationMs = Date.now() - attempt.startedAtMs;
    if (readDurationMs < MIN_READ_DURATION_MS) {
      return reply.code(400).send({
        error: 'READ_TOO_FAST',
        minReadDurationMs: MIN_READ_DURATION_MS,
        actualReadDurationMs: readDurationMs,
      });
    }

    const reader = await prisma.user.findUnique({ where: { id: readerId } });
    if (!reader) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    if (reader.quizWrongStreak >= QUIZ_TURNSTILE_STREAK_THRESHOLD) {
      const turnstileOk = await verifyTurnstileToken(body.data.turnstileToken, request.ip);
      if (!turnstileOk) {
        return reply.code(403).send({ error: 'TURNSTILE_REQUIRED' });
      }
    }

    // Consume attempt token (single-use)
    await kv.del(attemptKey);

    if (body.data.selectedIndex !== attempt.correctShuffledIndex) {
      const updatedUser = await prisma.user.update({
        where: { id: readerId },
        data: { quizWrongStreak: { increment: 1 } },
      });
      return reply.code(200).send({
        correct: false,
        quizWrongStreak: updatedUser.quizWrongStreak,
        requiresTurnstileNext: updatedUser.quizWrongStreak >= QUIZ_TURNSTILE_STREAK_THRESHOLD,
      });
    }

    const ipHash = crypto
      .createHash('sha256')
      .update(request.ip || 'unknown')
      .digest('hex')
      .slice(0, 32);

    const settlement = await ledger.runInTransaction(async (tx) => {
      // Row-level lock on BlindBox
      const lockedBoxes = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          ownerId: string | null;
          totalPopAmount: string;
          maxClicks: number;
          claimedClicks: number;
          expiresAt: Date | null;
        }>
      >`SELECT "id", "status", "ownerId", "totalPopAmount", "maxClicks", "claimedClicks", "expiresAt" FROM "BlindBox" WHERE "id" = ${boxId} FOR UPDATE`;

      const lockedBox = lockedBoxes[0];
      if (!lockedBox || lockedBox.status !== 'ACTIVE') {
        throw new Error('BOX_NOT_ACTIVE');
      }
      if (lockedBox.expiresAt && lockedBox.expiresAt <= new Date()) {
        throw new Error('BOX_EXPIRED');
      }
      if (lockedBox.claimedClicks >= lockedBox.maxClicks) {
        throw new Error('BOX_COMPLETED');
      }
      if (!lockedBox.ownerId) {
        throw new Error('BOX_OWNER_MISSING');
      }

      const totalPop = (await tx.blindBox.findUniqueOrThrow({ where: { id: boxId } }))
        .totalPopAmount;
      const readerPop = totalPop
        .mul(BOX_REWARD_SPLIT.READER_CLICK_TOTAL_PCT)
        .div(100)
        .div(lockedBox.maxClicks);
      const ownerPop = totalPop
        .mul(BOX_REWARD_SPLIT.OWNER_CLICK_TOTAL_PCT)
        .div(100)
        .div(lockedBox.maxClicks);

      const newClicks = lockedBox.claimedClicks + 1;
      const nextStatus =
        newClicks >= lockedBox.maxClicks ? BlindBoxStatus.COMPLETED : BlindBoxStatus.ACTIVE;

      await tx.blindBox.update({
        where: { id: boxId },
        data: {
          claimedClicks: newClicks,
          status: nextStatus,
        },
      });

      await tx.clickLog.create({
        data: {
          boxId,
          readerId,
          source: body.data.source as ClickSource,
          tgGroupId: body.data.tgGroupId,
          readerPopEarned: readerPop,
          ownerPopUnlocked: ownerPop,
          readDurationMs,
          ipHash,
          deviceFingerprint: body.data.deviceFingerprint,
        },
      });

      if (body.data.tgGroupId) {
        await tx.tgGroup.updateMany({
          where: { chatId: body.data.tgGroupId },
          data: { totalClicksDriven: { increment: 1 } },
        });
      }

      // Reset reader wrong streak on correct answer
      await tx.user.update({
        where: { id: readerId },
        data: { quizWrongStreak: 0 },
      });

      // Dual-reward ledger credits: 30%/maxClicks -> reader, 50%/maxClicks -> owner
      const readerLedger = await ledger.applyInTx(tx, {
        userId: readerId,
        asset: AssetType.POP,
        column: 'popAvailable',
        direction: LedgerDirection.CREDIT,
        amount: readerPop,
        reason: LedgerReason.QUIZ_READER_REWARD,
        refId: boxId,
        idempotencyKey: `quiz:reader:${boxId}:${readerId}`,
      });

      await ledger.applyInTx(tx, {
        userId: lockedBox.ownerId,
        asset: AssetType.POP,
        column: 'popAvailable',
        direction: LedgerDirection.CREDIT,
        amount: ownerPop,
        reason: LedgerReason.QUIZ_OWNER_UNLOCK,
        refId: boxId,
        idempotencyKey: `quiz:owner:${boxId}:${readerId}`,
      });

      return {
        readerPop: readerPop.toString(),
        ownerPop: ownerPop.toString(),
        readerBalanceAfter: readerLedger.balanceAfter.toString(),
        claimedClicks: newClicks,
        maxClicks: lockedBox.maxClicks,
        boxCompleted: nextStatus === BlindBoxStatus.COMPLETED,
      };
    });

    return {
      correct: true,
      ...settlement,
    };
  });
}
