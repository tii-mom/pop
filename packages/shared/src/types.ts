import {
  BlindBoxStatus,
  BoxTierId,
  MarketListingStatus,
  PopClaimStatus,
  RiskLevel,
  SeasonStatus,
  SocialPlatform,
} from './enums.js';

export interface UserProfileDto {
  id: string;
  walletAddress: string | null;
  telegramId: string | null;
  xUsername: string | null;
  xFollowers: number;
  binanceSquareUrl: string | null;
  squareFollowers: number;
  squareVerified: boolean;
  bnbAvailable: string;
  bnbLocked: string;
  popAvailable: string;
  popPendingClaim: string;
  popClaimedTotal: string;
  riskLevel: RiskLevel;
  hasPriorityPass: boolean;
  isWhaleWhitelisted: boolean;
}

export interface SeasonDto {
  id: number;
  status: SeasonStatus;
  targetBnb: string;
  totalPopAllocated: string;
  refPriceBnb: string;
  poolCommitHash: string;
  priorityStartAt: string;
  publicStartAt: string;
  endAt: string;
}

export interface BlindBoxDto {
  id: string;
  seasonId: number;
  tierId: BoxTierId;
  seqIndex: number;
  totalPopAmount: string;
  maxClicks: number;
  claimedClicks: number;
  status: BlindBoxStatus;
  platform: SocialPlatform | null;
  targetUrl: string | null;
  externalPostId: string | null;
  contentTitle: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
}

export interface QuizQuestionPublicDto {
  attemptToken: string;
  boxId: string;
  questionText: string;
  options: [string, string, string];
  minReadDurationMs: number;
  requiresTurnstile: boolean;
}

export interface MarketListingDto {
  id: string;
  boxId: string;
  seasonId: number;
  tierId: BoxTierId;
  seqIndex: number;
  priceBnb: string;
  feeBnb: string;
  status: MarketListingStatus;
  sellerId: string;
  createdAt: string;
}

export interface PopClaimPrepareDto {
  claimId: string;
  walletAddress: `0x${string}`;
  amountPop: string;
  amountWei: string;
  nonce: string;
  deadline: number;
  signature: `0x${string}`;
  status: PopClaimStatus;
  verifyingContract: `0x${string}`;
  chainId: number;
}

export interface BatchLookupItemDto {
  platform: SocialPlatform;
  externalPostId: string;
  boxId: string;
  tierId: BoxTierId;
  remainingClicks: number;
  maxClicks: number;
  readerRewardPop: string;
  expiresAt: string;
}
