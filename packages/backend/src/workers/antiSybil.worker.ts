import { RiskLevel, type PrismaClient } from '@prisma/client';

/**
 * Daily T+1 Anti-Sybil clustering job:
 * 1. Synchronized click burst detection (>= 5 distinct readers on the same box within 5s sharing IP/device).
 * 2. Shared withdrawal sink detection (>= 3 distinct userIds withdrawing BNB to the same toAddress).
 */
export class AntiSybilJob {
  constructor(private readonly prisma: PrismaClient) {}

  async runOnce(): Promise<{ flaggedUsers: number }> {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const suspectUserIds = new Set<string>();

    // Rule 1: IP + fingerprint cluster on quiz clicks in last 24h
    const recentClicks = await this.prisma.clickLog.findMany({
      where: { createdAt: { gte: since } },
      select: {
        boxId: true,
        readerId: true,
        ipHash: true,
        deviceFingerprint: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const clusterMap = new Map<string, Array<{ readerId: string; ts: number }>>();
    for (const click of recentClicks) {
      const key = `${click.boxId}:${click.ipHash ?? 'noip'}:${click.deviceFingerprint ?? 'nofp'}`;
      const list = clusterMap.get(key) ?? [];
      list.push({ readerId: click.readerId, ts: click.createdAt.getTime() });
      clusterMap.set(key, list);
    }

    for (const entries of clusterMap.values()) {
      const uniqueReaders = new Set(entries.map((e) => e.readerId));
      if (uniqueReaders.size >= 5) {
        const spanMs = entries[entries.length - 1].ts - entries[0].ts;
        if (spanMs <= 5_000) {
          uniqueReaders.forEach((uid) => suspectUserIds.add(uid));
        }
      }
    }

    // Rule 2: Shared withdrawal address convergence (>= 3 distinct users -> same toAddress)
    const withdrawals = await this.prisma.bnbWithdrawal.findMany({
      where: { createdAt: { gte: since } },
      select: { userId: true, toAddress: true },
    });

    const addrToUsers = new Map<string, Set<string>>();
    for (const w of withdrawals) {
      const addr = w.toAddress.toLowerCase();
      const set = addrToUsers.get(addr) ?? new Set<string>();
      set.add(w.userId);
      addrToUsers.set(addr, set);
    }

    for (const users of addrToUsers.values()) {
      if (users.size >= 3) {
        users.forEach((uid) => suspectUserIds.add(uid));
      }
    }

    let flaggedUsers = 0;
    for (const userId of suspectUserIds) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { riskLevel: true },
      });
      if (!user || user.riskLevel === RiskLevel.BANNED) continue;

      const nextRisk =
        user.riskLevel === RiskLevel.NORMAL ? RiskLevel.WATCH : RiskLevel.HIGH;
      await this.prisma.user.update({
        where: { id: userId },
        data: { riskLevel: nextRisk },
      });
      flaggedUsers++;
    }

    return { flaggedUsers };
  }
}
