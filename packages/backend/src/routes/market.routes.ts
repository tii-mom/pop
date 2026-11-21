import type { FastifyInstance } from 'fastify';
import {
  AssetType,
  BlindBoxStatus,
  LedgerDirection,
  MarketListingStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { z } from 'zod';
import { LedgerReason } from '@pop-box/shared';
import { env } from '../config/env.js';
import { LedgerService } from '../services/ledger.service.js';
import { requireAuth } from '../middleware/auth.js';

export async function registerMarketRoutes(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; ledger: LedgerService }
): Promise<void> {
  const { prisma, ledger } = deps;

  // GET /api/v1/market/listings?tierId=0
  app.get('/market/listings', async (request) => {
    const query = z
      .object({
        tierId: z.coerce.number().int().min(0).max(2).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);

    const listings = await prisma.marketListing.findMany({
      where: {
        status: MarketListingStatus.OPEN,
        ...(query.tierId !== undefined ? { box: { tierId: query.tierId } } : {}),
      },
      include: {
        box: {
          select: { seasonId: true, tierId: true, seqIndex: true, maxClicks: true },
        },
      },
      orderBy: { priceBnb: 'asc' },
      take: query.limit,
    });

    // Compute floor price per tier
    const floors: Record<number, string | null> = { 0: null, 1: null, 2: null };
    for (const l of listings) {
      const t = l.box.tierId;
      if (floors[t] === null) {
        floors[t] = l.priceBnb.toString();
      }
    }

    return {
      feeBps: env.MARKET_FEE_BPS,
      floors,
      listings: listings.map((l) => ({
        id: l.id,
        boxId: l.boxId,
        seasonId: l.box.seasonId,
        tierId: l.box.tierId,
        seqIndex: l.box.seqIndex,
        priceBnb: l.priceBnb.toString(),
        feeBnb: l.feeBnb.toString(),
        status: l.status,
        sellerId: l.sellerId,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  });

  // POST /api/v1/market/list (only SEALED boxes)
  app.post('/market/list', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        boxId: z.string().min(1),
        priceBnb: z.string().refine((v) => Number(v) > 0, 'priceBnb must be > 0'),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD', details: body.error.flatten() });
    }

    const sellerId = request.authUser!.sub;
    const price = new Prisma.Decimal(body.data.priceBnb);
    const fee = price.mul(env.MARKET_FEE_BPS).div(10000);

    const listing = await ledger.runInTransaction(async (tx) => {
      const box = await tx.blindBox.findUnique({ where: { id: body.data.boxId } });
      if (!box || box.ownerId !== sellerId) {
        throw new Error('BOX_NOT_FOUND');
      }
      if (box.status !== BlindBoxStatus.SEALED) {
        throw new Error('ONLY_SEALED_CAN_LIST');
      }

      await tx.blindBox.update({
        where: { id: box.id },
        data: { status: BlindBoxStatus.LISTED },
      });

      return tx.marketListing.create({
        data: {
          boxId: box.id,
          sellerId,
          priceBnb: price,
          feeBnb: fee,
          status: MarketListingStatus.OPEN,
        },
      });
    });

    return {
      listingId: listing.id,
      boxId: listing.boxId,
      priceBnb: listing.priceBnb.toString(),
      feeBnb: listing.feeBnb.toString(),
      status: listing.status,
    };
  });

  // POST /api/v1/market/cancel
  app.post('/market/cancel', { preHandler: requireAuth }, async (request, reply) => {
    const body = z.object({ listingId: z.string().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD' });
    }

    const sellerId = request.authUser!.sub;
    await ledger.runInTransaction(async (tx) => {
      const listing = await tx.marketListing.findUnique({ where: { id: body.data.listingId } });
      if (!listing || listing.sellerId !== sellerId) {
        throw new Error('LISTING_NOT_FOUND');
      }
      if (listing.status !== MarketListingStatus.OPEN) {
        throw new Error('LISTING_NOT_OPEN');
      }

      await tx.marketListing.update({
        where: { id: listing.id },
        data: { status: MarketListingStatus.CANCELLED },
      });

      await tx.blindBox.update({
        where: { id: listing.boxId },
        data: { status: BlindBoxStatus.SEALED },
      });
    });

    return { cancelled: true, listingId: body.data.listingId };
  });

  // POST /api/v1/market/buy (zero-gas off-chain BNB trade with 4% seller fee)
  app.post('/market/buy', { preHandler: requireAuth }, async (request, reply) => {
    const body = z.object({ listingId: z.string().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD' });
    }

    const buyerId = request.authUser!.sub;

    const result = await ledger.runInTransaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT "id", "status" FROM "MarketListing" WHERE "id" = ${body.data.listingId} FOR UPDATE
      `;
      if (!locked[0] || locked[0].status !== 'OPEN') {
        throw new Error('LISTING_NOT_OPEN');
      }

      const listing = await tx.marketListing.findUniqueOrThrow({
        where: { id: body.data.listingId },
      });
      if (listing.sellerId === buyerId) {
        throw new Error('CANNOT_BUY_OWN_LISTING');
      }

      const sellerNet = listing.priceBnb.sub(listing.feeBnb);

      // 1. Debit buyer bnbAvailable
      const buyerLedger = await ledger.applyInTx(tx, {
        userId: buyerId,
        asset: AssetType.BNB,
        column: 'bnbAvailable',
        direction: LedgerDirection.DEBIT,
        amount: listing.priceBnb,
        reason: LedgerReason.MARKET_BUY_DEBIT,
        refId: listing.id,
        idempotencyKey: `market:buy:debit:${listing.id}`,
      });

      // 2. Credit seller 96% (100% - feeBps)
      await ledger.applyInTx(tx, {
        userId: listing.sellerId,
        asset: AssetType.BNB,
        column: 'bnbAvailable',
        direction: LedgerDirection.CREDIT,
        amount: sellerNet,
        reason: LedgerReason.MARKET_SELL_CREDIT,
        refId: listing.id,
        idempotencyKey: `market:buy:credit:${listing.id}`,
      });

      // 3. Mark listing SOLD and transfer box ownership back to SEALED
      await tx.marketListing.update({
        where: { id: listing.id },
        data: {
          status: MarketListingStatus.SOLD,
          buyerId,
        },
      });

      await tx.blindBox.update({
        where: { id: listing.boxId },
        data: {
          ownerId: buyerId,
          status: BlindBoxStatus.SEALED,
        },
      });

      return {
        listingId: listing.id,
        boxId: listing.boxId,
        priceBnb: listing.priceBnb.toString(),
        feeBnb: listing.feeBnb.toString(),
        sellerNetBnb: sellerNet.toString(),
        buyerBnbAfter: buyerLedger.balanceAfter.toString(),
      };
    });

    return result;
  });
}
