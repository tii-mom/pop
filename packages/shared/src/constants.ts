import { BoxTierId } from './enums.js';

/** Total supply: 1,000,000,000 $POP (18 decimals) */
export const POP_TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;

/** Initial token allocations (in whole tokens) */
export const POP_ALLOCATION = {
  LP: 100_000_000n,        // 10%
  TEAM: 200_000_000n,      // 20%
  MARKETING: 100_000_000n, // 10%
  ECOSYSTEM: 600_000_000n, // 60%
} as const;

export const SEASON_1_TOTAL_POP = 60_000_000;
export const SEASON_MAX_POP_CAP = 60_000_000;

export const BOX_ACTIVE_DURATION_HOURS = 72;
export const PRIORITY_WINDOW_MINUTES = 30;
export const CLAIM_SIGNATURE_TTL_MINUTES = 15;
export const QUIZ_ATTEMPT_TTL_SECONDS = 600;
export const MIN_READ_DURATION_MS = 5_000;
export const QUIZ_TURNSTILE_STREAK_THRESHOLD = 2;

/** Box reward split percentages */
export const BOX_REWARD_SPLIT = {
  OWNER_INSTANT_PCT: 20,
  OWNER_CLICK_TOTAL_PCT: 50,
  READER_CLICK_TOTAL_PCT: 30,
} as const;

/** Secondary market fee defaults (basis points, 10000 = 100%) */
export const MARKET_FEE_BPS = {
  DEFAULT: 400, // 4%
  MIN: 300,     // 3%
  MAX: 500,     // 5%
} as const;

/** Hot custody wallet & withdrawal thresholds (BNB) */
export const BNB_CUSTODY_LIMITS = {
  HOT_WALLET_MAX_BNB: 5,
  MIN_WITHDRAW_BNB: 0.02,
  AUTO_WITHDRAW_MAX_BNB: 0.5,
} as const;

export interface TierSpec {
  tierId: BoxTierId;
  name: string;
  priceBnb: string;
  maxSupply: number;
  maxPerWallet: number;
  maxClicks: number;
  minPop: number;
  maxPop: number;
  avgPop: number;
  requiresWhaleWhitelist: boolean;
}

export const SEASON_1_TIERS: readonly TierSpec[] = [
  {
    tierId: BoxTierId.MINI,
    name: '青苹果',
    priceBnb: '0.01',
    maxSupply: 2500,
    maxPerWallet: 20, // Dynamic on-chain: min(2 + validReferrals * 2, 20)
    maxClicks: 10,
    minPop: 4_500,
    maxPop: 9_000,
    avgPop: 6_000,
    requiresWhaleWhitelist: false,
  },
  {
    tierId: BoxTierId.PRO,
    name: '黄香蕉',
    priceBnb: '0.1',
    maxSupply: 500,
    maxPerWallet: 5, // Dynamic on-chain: min(1 + floor(validReferrals / 2), 5)
    maxClicks: 60,
    minPop: 45_000,
    maxPop: 100_000,
    avgPop: 60_000,
    requiresWhaleWhitelist: false,
  },
  {
    tierId: BoxTierId.WHALE,
    name: '橙子',
    priceBnb: '1',
    maxSupply: 25,
    maxPerWallet: 1, // Dynamic on-chain: validReferrals >= 5 || whalePublicOpen ? 1 : 0
    maxClicks: 400,
    minPop: 450_000,
    maxPop: 1_200_000,
    avgPop: 600_000,
    requiresWhaleWhitelist: false,
  },
] as const;

export function computeReferralTierLimit(
  tierId: number,
  validReferrals: number,
  whalePublicOpen = false
): number {
  const refs = Math.max(0, Math.floor(validReferrals));
  if (tierId === BoxTierId.MINI) return Math.min(2 + refs * 2, 20);
  if (tierId === BoxTierId.PRO) return Math.min(1 + Math.floor(refs / 2), 5);
  if (tierId === BoxTierId.WHALE) return refs >= 5 || whalePublicOpen ? 1 : 0;
  return 0;
}

/** BNB sale split basis points by season (sum = 10000) */
export const SEASON_BNB_SPLITS = {
  SEASON_1: { lpBps: 8000, reserveBps: 0, teamBps: 2000 },
  SEASON_2_TO_3: { lpBps: 1000, reserveBps: 5500, teamBps: 3500 },
  SEASON_4_PLUS: { lpBps: 0, reserveBps: 6000, teamBps: 4000 },
} as const;

/** PancakeSwap V3 initial liquidity reference (documentation & dashboard) */
export const PANCAKESWAP_V3_INIT_SPEC = {
  feeTierBps: 100, // 1%
  initialPriceBnbPerPop: 0.000002,
  popPerBnb: 500_000,
  fdvBnb: 2_000,
  basePool: { bnb: 80, pop: 40_000_000, minPrice: 0.0000001, maxPrice: 0.0000022 },
  ladderA: { bnb: 0, pop: 30_000_000, minPrice: 0.0000022, maxPrice: 0.000006 },
  ladderB: { bnb: 0, pop: 30_000_000, minPrice: 0.000006, maxPrice: 0.00002 },
} as const;

/** Dynamic POP allocation formula for Seasons 2-10 */
export function computeDynamicSeasonPop(
  seasonTargetBnb: number,
  refPriceBnb: number
): number {
  if (seasonTargetBnb <= 0 || refPriceBnb <= 0) {
    throw new Error('seasonTargetBnb and refPriceBnb must be positive');
  }
  const raw = Math.floor((1.15 * seasonTargetBnb) / refPriceBnb);
  return Math.min(raw, SEASON_MAX_POP_CAP);
}
