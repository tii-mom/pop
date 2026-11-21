import { AssetType, BlindBoxStatus, PopClaimStatus, type PrismaClient } from '@prisma/client';
import { LedgerReason } from '@pop-box/shared';
import { LedgerService } from '../services/ledger.service.js';

export class ExpiryWorker {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ledger: LedgerService
  ) {}

  async runOnce(): Promise<{ expiredBoxes: number; revertedClaims: number }> {
    const now = new Date();

    // 1. Expire 72h ACTIVE blind boxes
    const boxRes = await this.prisma.blindBox.updateMany({
      where: {
        status: BlindBoxStatus.ACTIVE,
        expiresAt: { lte: now },
      },
      data: {
        status: BlindBoxStatus.EXPIRED,
      },
    });

    // 2. Revert 15-min expired SIGNED PopClaim vouchers back to popAvailable
    const expiredClaims = await this.prisma.popClaim.findMany({
      where: {
        status: PopClaimStatus.SIGNED,
        deadline: { lte: now },
      },
      take: 100,
    });

    let revertedClaims = 0;
    for (const claim of expiredClaims) {
      await this.ledger.runInTransaction(async (tx) => {
        const updated = await tx.popClaim.updateMany({
          where: { id: claim.id, status: PopClaimStatus.SIGNED },
          data: { status: PopClaimStatus.EXPIRED_REVERTED },
        });
        if (updated.count === 0) return;

        await this.ledger.moveColumnsInTx(tx, {
          userId: claim.userId,
          asset: AssetType.POP,
          fromColumn: 'popPendingClaim',
          toColumn: 'popAvailable',
          amount: claim.amountPop,
          reason: LedgerReason.POP_CLAIM_REVERT,
          refId: claim.id,
          idempotencyKey: `pop:claim:revert:${claim.id}`,
        });
        revertedClaims++;
      });
    }

    return { expiredBoxes: boxRes.count, revertedClaims };
  }
}
