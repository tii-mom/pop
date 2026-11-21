import type { FastifyInstance } from 'fastify';
import {
  AssetType,
  BlindBoxStatus,
  LedgerDirection,
  Prisma,
  type PrismaClient,
  SocialPlatform,
} from '@prisma/client';
import { z } from 'zod';
import {
  BOX_ACTIVE_DURATION_HOURS,
  BOX_REWARD_SPLIT,
  LedgerReason,
  PriorityPassSource,
  parseSocialPostUrl,
} from '@pop-box/shared';
import { LedgerService } from '../services/ledger.service.js';
import { generateQuizQuestionsFromContent } from '../services/quizLlm.service.js';
import { requireAuth } from '../middleware/auth.js';

export async function registerBoxRoutes(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; ledger: LedgerService }
): Promise<void> {
  const { prisma, ledger } = deps;

  // GET /api/v1/boxes/my
  app.get('/boxes/my', { preHandler: requireAuth }, async (request) => {
    const boxes = await prisma.blindBox.findMany({
      where: { ownerId: request.authUser!.sub },
      orderBy: [{ createdAt: 'desc' }],
    });
    return {
      boxes: boxes.map((b) => ({
        ...b,
        totalPopAmount: b.totalPopAmount.toString(),
      })),
    };
  });

  // POST /api/v1/boxes/:id/activate
  app.post('/boxes/:id/activate', { preHandler: requireAuth }, async (request, reply) => {
    const boxId = (request.params as { id: string }).id;
    const body = z
      .object({
        targetUrl: z.string().url(),
        contentTitle: z.string().min(2).max(200).optional(),
        contentSnapshot: z.string().min(10).max(5000),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD', details: body.error.flatten() });
    }

    const parsedUrl = parseSocialPostUrl(body.data.targetUrl);
    if (!parsedUrl) {
      return reply.code(400).send({
        error: 'UNSUPPORTED_POST_URL',
        message: 'Only valid X (Twitter) status URLs or Binance Square post URLs are supported',
      });
    }

    const box = await prisma.blindBox.findUnique({ where: { id: boxId } });
    if (!box || box.ownerId !== request.authUser!.sub) {
      return reply.code(404).send({ error: 'BOX_NOT_FOUND' });
    }
    if (box.status !== BlindBoxStatus.SEALED) {
      return reply.code(409).send({ error: 'BOX_NOT_SEALED', currentStatus: box.status });
    }

    const contentTitle = body.data.contentTitle ?? `${parsedUrl.platform} #${parsedUrl.externalPostId}`;
    const questions = await generateQuizQuestionsFromContent({
      title: contentTitle,
      content: body.data.contentSnapshot,
      platform: parsedUrl.platform,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + BOX_ACTIVE_DURATION_HOURS * 3600 * 1000);
    const instantPop = box.totalPopAmount.mul(BOX_REWARD_SPLIT.OWNER_INSTANT_PCT).div(100);
    const nextSeasonId = box.seasonId + 1;

    const result = await ledger.runInTransaction(async (tx) => {
      // Lock box row to prevent double activation
      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT "id", "status" FROM "BlindBox" WHERE "id" = ${box.id} FOR UPDATE
      `;
      if (!locked[0] || locked[0].status !== 'SEALED') {
        throw new Error('BOX_ALREADY_ACTIVATED');
      }

      const updatedBox = await tx.blindBox.update({
        where: { id: box.id },
        data: {
          status: BlindBoxStatus.ACTIVE,
          platform: parsedUrl.platform as SocialPlatform,
          targetUrl: parsedUrl.canonicalUrl,
          externalPostId: parsedUrl.externalPostId,
          contentTitle,
          contentSnapshot: body.data.contentSnapshot,
          activatedAt: now,
          expiresAt,
        },
      });

      await tx.quizQuestion.createMany({
        data: questions.map((q) => ({
          boxId: box.id,
          questionText: q.questionText,
          optionsJson: q.options as unknown as Prisma.InputJsonValue,
          correctIndex: q.correctIndex,
        })),
      });

      // Instant 20% $POP unlock for box owner
      const ledgerRes = await ledger.applyInTx(tx, {
        userId: request.authUser!.sub,
        asset: AssetType.POP,
        column: 'popAvailable',
        direction: LedgerDirection.CREDIT,
        amount: instantPop,
        reason: LedgerReason.BOX_ACTIVATE_INSTANT,
        refId: box.id,
        idempotencyKey: `box:activate:${box.id}`,
      });

      // Auto-grant PriorityPass for next season if next season row exists
      const nextSeason = await tx.season.findUnique({ where: { id: nextSeasonId } });
      let priorityPassGranted = false;
      if (nextSeason) {
        await tx.priorityPass.upsert({
          where: {
            userId_forSeasonId: {
              userId: request.authUser!.sub,
              forSeasonId: nextSeasonId,
            },
          },
          create: {
            userId: request.authUser!.sub,
            forSeasonId: nextSeasonId,
            source: PriorityPassSource.BOX_ACTIVATED,
          },
          update: {},
        });
        priorityPassGranted = true;
      }

      return { updatedBox, instantPop, balanceAfter: ledgerRes.balanceAfter, priorityPassGranted };
    });

    return {
      boxId: result.updatedBox.id,
      status: result.updatedBox.status,
      platform: result.updatedBox.platform,
      targetUrl: result.updatedBox.targetUrl,
      externalPostId: result.updatedBox.externalPostId,
      activatedAt: result.updatedBox.activatedAt?.toISOString(),
      expiresAt: result.updatedBox.expiresAt?.toISOString(),
      instantPopUnlocked: result.instantPop.toString(),
      popAvailableAfter: result.balanceAfter.toString(),
      questionCount: questions.length,
      priorityPassGrantedForSeason: result.priorityPassGranted ? nextSeasonId : null,
    };
  });

  // GET /api/v1/boxes/feed?platform=X|BINANCE_SQUARE&tierId=2&limit=30
  app.get('/boxes/feed', async (request) => {
    const query = z
      .object({
        platform: z.enum(['X', 'BINANCE_SQUARE']).optional(),
        tierId: z.coerce.number().int().min(0).max(2).optional(),
        id: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query);

    const now = new Date();
    const boxes = await prisma.blindBox.findMany({
      where: {
        status: BlindBoxStatus.ACTIVE,
        expiresAt: { gt: now },
        ...(query.id ? { id: query.id } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.tierId !== undefined ? { tierId: query.tierId } : {}),
      },
      orderBy: [{ tierId: 'desc' }, { activatedAt: 'desc' }],
      include: { owner: { select: { xUsername: true } } },
      take: query.limit,
    });

    return {
      items: boxes.map((b) => {
        const readerPerClick = b.totalPopAmount
          .mul(BOX_REWARD_SPLIT.READER_CLICK_TOTAL_PCT)
          .div(100)
          .div(b.maxClicks);
        return {
          id: b.id,
          seasonId: b.seasonId,
          tierId: b.tierId,
          platform: b.platform,
          targetUrl: b.targetUrl,
          externalPostId: b.externalPostId,
          contentTitle: b.contentTitle,
          maxClicks: b.maxClicks,
          claimedClicks: b.claimedClicks,
          remainingClicks: Math.max(0, b.maxClicks - b.claimedClicks),
          sharer: b.owner?.xUsername ?? null,
          remainingReaderPop: readerPerClick.mul(b.maxClicks - b.claimedClicks).toDecimalPlaces(4).toString(),
          readerRewardPop: readerPerClick.toDecimalPlaces(4).toString(),
          expiresAt: b.expiresAt?.toISOString() ?? null,
        };
      }),
    };
  });

  // POST /api/v1/boxes/batch-lookup (Chrome extension batch lookup up to 50 postIds)
  app.post('/boxes/batch-lookup', async (request, reply) => {
    const body = z
      .object({
        platform: z.enum(['X', 'BINANCE_SQUARE']),
        postIds: z.array(z.string().min(1).max(64)).min(1).max(50),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD', details: body.error.flatten() });
    }

    const now = new Date();
    const boxes = await prisma.blindBox.findMany({
      where: {
        platform: body.data.platform,
        externalPostId: { in: body.data.postIds },
        status: BlindBoxStatus.ACTIVE,
        expiresAt: { gt: now },
      },
    });

    return {
      matches: boxes.map((b) => {
        const readerPerClick = b.totalPopAmount
          .mul(BOX_REWARD_SPLIT.READER_CLICK_TOTAL_PCT)
          .div(100)
          .div(b.maxClicks);
        return {
          platform: b.platform,
          externalPostId: b.externalPostId,
          boxId: b.id,
          tierId: b.tierId,
          remainingClicks: Math.max(0, b.maxClicks - b.claimedClicks),
          maxClicks: b.maxClicks,
          readerRewardPop: readerPerClick.toDecimalPlaces(2).toString(),
          expiresAt: b.expiresAt?.toISOString() ?? null,
        };
      }),
    };
  });
}
