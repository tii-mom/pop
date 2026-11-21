import { Prisma, PrismaClient, AssetType, LedgerDirection } from '@prisma/client';

export type LedgerTxClient = Prisma.TransactionClient;

export type BalanceColumn =
  | 'bnbAvailable'
  | 'bnbLocked'
  | 'popAvailable'
  | 'popPendingClaim'
  | 'popClaimedTotal';

export interface LedgerMutationInput {
  userId: string;
  asset: AssetType;
  column: BalanceColumn;
  direction: LedgerDirection;
  amount: Prisma.Decimal | string | number;
  reason: string;
  refId?: string;
  idempotencyKey: string;
}

export class InsufficientBalanceError extends Error {
  constructor(message = 'Insufficient balance') {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

export class LedgerService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Executes a double-entry balance mutation inside an existing Prisma transaction
   * with PostgreSQL row-level locking (`SELECT ... FOR UPDATE`), idempotency protection,
   * strict non-negative balance enforcement, and immutable LedgerEntry recording.
   */
  async applyInTx(
    tx: LedgerTxClient,
    input: LedgerMutationInput
  ): Promise<{ balanceAfter: Prisma.Decimal; deduplicated: boolean }> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      throw new Error(`Ledger amount must be positive, got ${amount.toString()}`);
    }

    // 1. Idempotency check
    const existing = await tx.ledgerEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { balanceAfter: true },
    });
    if (existing) {
      return { balanceAfter: existing.balanceAfter, deduplicated: true };
    }

    // 2. Acquire row-level lock on User row
    const lockedRows = await tx.$queryRaw<
      Array<{
        id: string;
        bnbAvailable: Prisma.Decimal;
        bnbLocked: Prisma.Decimal;
        popAvailable: Prisma.Decimal;
        popPendingClaim: Prisma.Decimal;
        popClaimedTotal: Prisma.Decimal;
      }>
    >`SELECT "id", "bnbAvailable", "bnbLocked", "popAvailable", "popPendingClaim", "popClaimedTotal" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;

    const userRow = lockedRows[0];
    if (!userRow) {
      throw new Error(`User not found for ledger mutation: ${input.userId}`);
    }

    const currentBalance = new Prisma.Decimal(userRow[input.column]);
    const nextBalance =
      input.direction === LedgerDirection.CREDIT
        ? currentBalance.add(amount)
        : currentBalance.sub(amount);

    if (nextBalance.lt(0)) {
      throw new InsufficientBalanceError(
        `Insufficient ${input.column} for user ${input.userId}: have ${currentBalance.toString()}, need ${amount.toString()}`
      );
    }

    // 3. Update balance atomically
    await tx.user.update({
      where: { id: input.userId },
      data: {
        [input.column]: nextBalance,
      },
    });

    // 4. Append immutable LedgerEntry audit record
    await tx.ledgerEntry.create({
      data: {
        userId: input.userId,
        asset: input.asset,
        direction: input.direction,
        amount,
        balanceAfter: nextBalance,
        reason: input.reason,
        refId: input.refId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    return { balanceAfter: nextBalance, deduplicated: false };
  }

  /**
   * Moves balance between two columns of the same user atomically (e.g. popAvailable -> popPendingClaim).
   */
  async moveColumnsInTx(
    tx: LedgerTxClient,
    params: {
      userId: string;
      asset: AssetType;
      fromColumn: BalanceColumn;
      toColumn: BalanceColumn;
      amount: Prisma.Decimal | string | number;
      reason: string;
      refId?: string;
      idempotencyKey: string;
    }
  ): Promise<{ fromAfter: Prisma.Decimal; toAfter: Prisma.Decimal }> {
    const debit = await this.applyInTx(tx, {
      userId: params.userId,
      asset: params.asset,
      column: params.fromColumn,
      direction: LedgerDirection.DEBIT,
      amount: params.amount,
      reason: params.reason,
      refId: params.refId,
      idempotencyKey: `${params.idempotencyKey}:debit`,
    });

    const credit = await this.applyInTx(tx, {
      userId: params.userId,
      asset: params.asset,
      column: params.toColumn,
      direction: LedgerDirection.CREDIT,
      amount: params.amount,
      reason: params.reason,
      refId: params.refId,
      idempotencyKey: `${params.idempotencyKey}:credit`,
    });

    return { fromAfter: debit.balanceAfter, toAfter: credit.balanceAfter };
  }

  async runInTransaction<T>(fn: (tx: LedgerTxClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5000,
      timeout: 15000,
    });
  }
}
