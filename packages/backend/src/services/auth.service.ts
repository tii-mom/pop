import crypto from 'node:crypto';
import { getAddress, verifyMessage } from 'viem';

export interface AuthTokenPayload {
  sub: string; // userId
  walletAddress?: string | null;
  telegramId?: string | null;
  iat: number;
  exp: number;
}

export interface TelegramInitDataUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

export function signJwt(
  payload: Omit<AuthTokenPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds = 7 * 24 * 3600
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64UrlEncode(sig)}`;
}

export function verifyJwt(token: string, secret: string): AuthTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest()
  );

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(body)) as AuthTokenPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildSiweMessage(address: string, nonce: string): string {
  return `Sign in to POP Fruit ($POP)\nWallet: ${getAddress(address)}\nNonce: ${nonce}`;
}

export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: `0x${string}`
): Promise<boolean> {
  try {
    const checksumAddr = getAddress(address);
    return await verifyMessage({
      address: checksumAddr,
      message,
      signature,
    });
  } catch {
    return false;
  }
}

/**
 * Verifies Telegram WebApp initData using official HMAC-SHA256 specification.
 */
export function verifyTelegramInitData(
  initDataRaw: string,
  botToken: string,
  maxAgeSeconds = 86400
): { valid: boolean; user?: TelegramInitDataUser; authDate?: number } {
  if (!initDataRaw || !botToken) return { valid: false };

  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  if (!hash) return { valid: false };

  const authDate = Number(params.get('auth_date') || '0');
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || Math.abs(nowSec - authDate) > maxAgeSeconds) {
    return { valid: false };
  }

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') {
      pairs.push(`${key}=${value}`);
    }
  });
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const hashBuf = Buffer.from(hash, 'hex');
  const compBuf = Buffer.from(computedHash, 'hex');
  if (hashBuf.length !== compBuf.length || !crypto.timingSafeEqual(hashBuf, compBuf)) {
    return { valid: false };
  }

  const userJson = params.get('user');
  if (!userJson) return { valid: false };

  try {
    const user = JSON.parse(userJson) as TelegramInitDataUser;
    if (!user?.id) return { valid: false };
    return { valid: true, user, authDate };
  } catch {
    return { valid: false };
  }
}
