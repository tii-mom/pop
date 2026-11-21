import crypto from 'node:crypto';
import { encodePacked, keccak256 } from 'viem';
import { SEASON_1_TIERS, SEASON_1_TOTAL_POP, type TierSpec } from '@pop-box/shared';

export interface PoolBoxEntry {
  tierId: number;
  seqIndex: number;
  totalPopAmount: number;
  maxClicks: number;
}

export interface GeneratedSeasonPool {
  boxes: PoolBoxEntry[];
  totalPop: number;
  orderedPoolJson: string;
  seasonSalt: string;
  poolSaltEncrypted: string;
  poolCommitHash: `0x${string}`;
}

/**
 * Cryptographically secure Fisher-Yates shuffle.
 */
export function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

/**
 * Generates `count` random integers within [minVal, maxVal] whose exact sum equals `targetSum`.
 */
export function generateExactSumArray(
  count: number,
  minVal: number,
  maxVal: number,
  targetSum: number
): number[] {
  if (count <= 0) throw new Error('count must be positive');
  if (targetSum < count * minVal || targetSum > count * maxVal) {
    throw new Error(
      `targetSum (${targetSum}) out of feasible bounds [${count * minVal}, ${count * maxVal}]`
    );
  }

  // Start from uniform baseline near average, then apply zero-sum random perturbations within [minVal, maxVal]
  const base = Math.floor(targetSum / count);
  const remainder = targetSum - base * count;
  const values = new Array<number>(count).fill(base);
  for (let i = 0; i < remainder; i++) {
    values[i] += 1;
  }

  // Perform 3 * count paired random transfers preserving exact sum and bounds
  const rounds = count * 3;
  for (let r = 0; r < rounds; r++) {
    const i = crypto.randomInt(0, count);
    const j = crypto.randomInt(0, count);
    if (i === j) continue;

    const maxGive = values[i] - minVal;
    const maxTake = maxVal - values[j];
    const maxDelta = Math.min(maxGive, maxTake);
    if (maxDelta <= 0) continue;

    const delta = crypto.randomInt(1, maxDelta + 1);
    values[i] -= delta;
    values[j] += delta;
  }

  return fisherYatesShuffle(values);
}

/**
 * AES-256-GCM encryption for storing `seasonSalt` securely until season sells out.
 */
export function encryptSeasonSalt(salt: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('POOL_SALT_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(salt, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSeasonSalt(encryptedPayload: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const [ivHex, tagHex, dataHex] = encryptedPayload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted salt format');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function computePoolCommitHash(orderedPoolJson: string, seasonSalt: string): `0x${string}` {
  return keccak256(encodePacked(['string', 'string'], [orderedPoolJson, seasonSalt]));
}

/**
 * Generates an Ichiban-kuji fixed blind-box pool (default Season 1: 1,900 boxes totaling 60,000,000 $POP).
 */
export function generateSeasonPool(
  encryptionKeyHex: string,
  tiers: readonly TierSpec[] = SEASON_1_TIERS,
  targetTotalPop: number = SEASON_1_TOTAL_POP
): GeneratedSeasonPool {
  const boxes: PoolBoxEntry[] = [];
  const totalBaseBudget = tiers.reduce((acc, t) => acc + t.maxSupply * t.avgPop, 0);
  const scale = targetTotalPop / totalBaseBudget;

  let allocatedSoFar = 0;

  tiers.forEach((tier, idx) => {
    const isLast = idx === tiers.length - 1;
    const tierTarget = isLast
      ? targetTotalPop - allocatedSoFar
      : Math.round(tier.maxSupply * tier.avgPop * scale);
    allocatedSoFar += tierTarget;

    const scaledMin = Math.max(1, Math.floor(tier.minPop * scale));
    const scaledMax = Math.max(scaledMin, Math.ceil(tier.maxPop * scale));

    const amounts = generateExactSumArray(tier.maxSupply, scaledMin, scaledMax, tierTarget);
    amounts.forEach((amount, seqIndex) => {
      boxes.push({
        tierId: tier.tierId,
        seqIndex,
        totalPopAmount: amount,
        maxClicks: tier.maxClicks,
      });
    });
  });

  const totalPop = boxes.reduce((sum, b) => sum + b.totalPopAmount, 0);
  if (totalPop !== targetTotalPop) {
    throw new Error(`Pool sum mismatch: expected ${targetTotalPop}, got ${totalPop}`);
  }

  const orderedPoolJson = JSON.stringify(boxes);
  const seasonSalt = crypto.randomBytes(32).toString('hex');
  const poolSaltEncrypted = encryptSeasonSalt(seasonSalt, encryptionKeyHex);
  const poolCommitHash = computePoolCommitHash(orderedPoolJson, seasonSalt);

  return {
    boxes,
    totalPop,
    orderedPoolJson,
    seasonSalt,
    poolSaltEncrypted,
    poolCommitHash,
  };
}
