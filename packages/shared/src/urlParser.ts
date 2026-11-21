import { SocialPlatform } from './enums.js';

export interface ParsedSocialPostUrl {
  platform: SocialPlatform;
  externalPostId: string;
  canonicalUrl: string;
  handle?: string;
}

const X_POST_REGEX =
  /^https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:[/?#].*)?$/i;

const X_I_WEB_STATUS_REGEX =
  /^https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/i\/web\/status\/(\d+)(?:[/?#].*)?$/i;

const BINANCE_SQUARE_POST_REGEX =
  /^https?:\/\/(?:www\.)?binance\.com\/(?:[a-z]{2}(?:-[A-Za-z]{2,4})?\/)?square\/post\/(\d+)(?:[/?#].*)?$/i;

/**
 * Parses and normalizes an X (Twitter) or Binance Square post URL.
 * Returns null if the URL is invalid or does not belong to a supported post format.
 */
export function parseSocialPostUrl(rawUrl: string): ParsedSocialPostUrl | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const xMatch = X_POST_REGEX.exec(trimmed);
  if (xMatch) {
    const [, handle, postId] = xMatch;
    return {
      platform: SocialPlatform.X,
      externalPostId: postId,
      handle,
      canonicalUrl: `https://x.com/${handle}/status/${postId}`,
    };
  }

  const xWebMatch = X_I_WEB_STATUS_REGEX.exec(trimmed);
  if (xWebMatch) {
    const [, postId] = xWebMatch;
    return {
      platform: SocialPlatform.X,
      externalPostId: postId,
      canonicalUrl: `https://x.com/i/web/status/${postId}`,
    };
  }

  const sqMatch = BINANCE_SQUARE_POST_REGEX.exec(trimmed);
  if (sqMatch) {
    const [, postId] = sqMatch;
    return {
      platform: SocialPlatform.BINANCE_SQUARE,
      externalPostId: postId,
      canonicalUrl: `https://www.binance.com/en/square/post/${postId}`,
    };
  }

  return null;
}

/**
 * Compliance check for Binance Square share copy:
 * Forbids contract addresses (0x + 40 hex chars), DEX links, Telegram links, or TG redirect cues.
 */
const BINANCE_SQUARE_FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /0x[a-fA-F0-9]{40}/,
  /t\.me\//i,
  /telegram\.me\//i,
  /telegram\.org/i,
  /pancakeswap\.finance/i,
  /dexscreener\.com/i,
  /dextools\.io/i,
  /poocoin\.app/i,
  /加电报|进电报|跳转TG|私信领|拉群/i,
];

export function isBinanceSquareCompliantCopy(text: string): boolean {
  return !BINANCE_SQUARE_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}
