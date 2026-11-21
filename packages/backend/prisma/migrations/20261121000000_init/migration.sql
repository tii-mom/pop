-- POP Box ($POP) Initial PostgreSQL Migration
-- Mirrors packages/backend/prisma/schema.prisma (Decimal(36,18) for all financial amounts)

CREATE TYPE "RiskLevel" AS ENUM ('NORMAL', 'WATCH', 'HIGH', 'BANNED');
CREATE TYPE "SeasonStatus" AS ENUM ('UPCOMING', 'PRIORITY', 'PUBLIC', 'SOLD_OUT', 'SETTLED');
CREATE TYPE "BlindBoxStatus" AS ENUM ('UNSOLD', 'SEALED', 'LISTED', 'ACTIVE', 'COMPLETED', 'EXPIRED');
CREATE TYPE "SocialPlatform" AS ENUM ('X', 'BINANCE_SQUARE');
CREATE TYPE "ClickSource" AS ENUM ('TMA', 'WEB', 'EXT');
CREATE TYPE "MarketListingStatus" AS ENUM ('OPEN', 'SOLD', 'CANCELLED');
CREATE TYPE "AssetType" AS ENUM ('BNB', 'POP');
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "PopClaimStatus" AS ENUM ('SIGNED', 'CONFIRMED', 'EXPIRED_REVERTED');
CREATE TYPE "BnbWithdrawalStatus" AS ENUM ('PENDING_AUTO', 'PENDING_REVIEW', 'PROCESSING', 'CONFIRMED', 'REJECTED', 'FAILED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT UNIQUE,
    "telegramId" TEXT UNIQUE,
    "telegramUsername" TEXT,
    "xUserId" TEXT UNIQUE,
    "xUsername" TEXT,
    "xFollowers" INTEGER NOT NULL DEFAULT 0,
    "binanceSquareUrl" TEXT,
    "squareFollowers" INTEGER NOT NULL DEFAULT 0,
    "squareVerified" BOOLEAN NOT NULL DEFAULT false,
    "bnbAvailable" DECIMAL(36,18) NOT NULL DEFAULT 0 CHECK ("bnbAvailable" >= 0),
    "bnbLocked" DECIMAL(36,18) NOT NULL DEFAULT 0 CHECK ("bnbLocked" >= 0),
    "popAvailable" DECIMAL(36,18) NOT NULL DEFAULT 0 CHECK ("popAvailable" >= 0),
    "popPendingClaim" DECIMAL(36,18) NOT NULL DEFAULT 0 CHECK ("popPendingClaim" >= 0),
    "popClaimedTotal" DECIMAL(36,18) NOT NULL DEFAULT 0 CHECK ("popClaimedTotal" >= 0),
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'NORMAL',
    "quizWrongStreak" INTEGER NOT NULL DEFAULT 0,
    "referrerId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Season" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "status" "SeasonStatus" NOT NULL DEFAULT 'UPCOMING',
    "targetBnb" DECIMAL(36,18) NOT NULL,
    "totalPopAllocated" DECIMAL(36,18) NOT NULL,
    "refPriceBnb" DECIMAL(36,18) NOT NULL,
    "poolCommitHash" TEXT NOT NULL,
    "poolSaltEncrypted" TEXT NOT NULL,
    "priorityMerkleRoot" TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000000000000000000000000000',
    "whaleWhitelistRoot" TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000000000000000000000000000',
    "priorityStartAt" TIMESTAMP(3) NOT NULL,
    "publicStartAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "BlindBox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" INTEGER NOT NULL REFERENCES "Season"("id"),
    "tierId" INTEGER NOT NULL,
    "seqIndex" INTEGER NOT NULL,
    "totalPopAmount" DECIMAL(36,18) NOT NULL,
    "maxClicks" INTEGER NOT NULL,
    "claimedClicks" INTEGER NOT NULL DEFAULT 0,
    "status" "BlindBoxStatus" NOT NULL DEFAULT 'UNSOLD',
    "ownerId" TEXT REFERENCES "User"("id"),
    "purchaseTxHash" TEXT,
    "purchaseLogIndex" INTEGER,
    "platform" "SocialPlatform",
    "targetUrl" TEXT,
    "externalPostId" TEXT,
    "contentTitle" TEXT,
    "contentSnapshot" TEXT,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("seasonId", "tierId", "seqIndex"),
    UNIQUE ("purchaseTxHash", "purchaseLogIndex")
);

CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boxId" TEXT NOT NULL REFERENCES "BlindBox"("id") ON DELETE CASCADE,
    "questionText" TEXT NOT NULL,
    "optionsJson" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ClickLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boxId" TEXT NOT NULL REFERENCES "BlindBox"("id"),
    "readerId" TEXT NOT NULL REFERENCES "User"("id"),
    "source" "ClickSource" NOT NULL,
    "tgGroupId" TEXT,
    "readerPopEarned" DECIMAL(36,18) NOT NULL,
    "ownerPopUnlocked" DECIMAL(36,18) NOT NULL,
    "bnbCritEarned" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "readDurationMs" INTEGER NOT NULL,
    "ipHash" TEXT,
    "deviceFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("boxId", "readerId")
);

CREATE TABLE "MarketListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boxId" TEXT NOT NULL REFERENCES "BlindBox"("id"),
    "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
    "buyerId" TEXT REFERENCES "User"("id"),
    "priceBnb" DECIMAL(36,18) NOT NULL,
    "feeBnb" DECIMAL(36,18) NOT NULL,
    "status" "MarketListingStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "asset" "AssetType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "balanceAfter" DECIMAL(36,18) NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "idempotencyKey" TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PopClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "walletAddress" TEXT NOT NULL,
    "amountPop" DECIMAL(36,18) NOT NULL,
    "nonce" BIGINT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "signature" TEXT NOT NULL,
    "status" "PopClaimStatus" NOT NULL DEFAULT 'SIGNED',
    "txHash" TEXT UNIQUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "BnbDeposit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "txHash" TEXT NOT NULL UNIQUE,
    "fromAddress" TEXT NOT NULL,
    "amountBnb" DECIMAL(36,18) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "creditedUserId" TEXT REFERENCES "User"("id"),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "BnbWithdrawal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "status" "BnbWithdrawalStatus" NOT NULL DEFAULT 'PENDING_AUTO',
    "amountBnb" DECIMAL(36,18) NOT NULL,
    "toAddress" TEXT NOT NULL,
    "txHash" TEXT UNIQUE,
    "riskNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PriorityPass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "forSeasonId" INTEGER NOT NULL REFERENCES "Season"("id"),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("userId", "forSeasonId")
);

CREATE TABLE "TgGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL UNIQUE,
    "title" TEXT,
    "ownerUserId" TEXT NOT NULL REFERENCES "User"("id"),
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "activeUsers3d" INTEGER NOT NULL DEFAULT 0,
    "whitelistGranted" BOOLEAN NOT NULL DEFAULT false,
    "totalClicksDriven" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "LpSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "bnbValue" DECIMAL(36,18) NOT NULL,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("walletAddress", "snapshotDate")
);

CREATE TABLE "SyncCursor" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "blockNumber" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
