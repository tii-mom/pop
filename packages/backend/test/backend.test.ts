import crypto from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import { verifyTypedData } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  buildPopClaimDomain,
  POP_CLAIM_EIP712_TYPES,
  SEASON_1_TOTAL_POP,
} from '@pop-box/shared';
import {
  computePoolCommitHash,
  decryptSeasonSalt,
  generateSeasonPool,
} from '../src/services/poolShuffler.service.js';
import { AddressMerkleTree } from '../src/services/merkle.service.js';
import {
  signJwt,
  verifyJwt,
  verifyTelegramInitData,
} from '../src/services/auth.service.js';
import { signPopClaimVoucher } from '../src/services/claimSigner.service.js';
import { generateQuizQuestionsFromContent } from '../src/services/quizLlm.service.js';
import { buildApp } from '../src/app.js';
import { MemoryKVStore } from '../src/lib/redis.js';

const TEST_ENC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('POP Box Backend Core Services & API Integration', () => {
  it('generates Season 1 Ichiban-kuji pool with exact 60,000,000 $POP sum, verifiable commit hash, and AES-GCM salt roundtrip', () => {
    const pool = generateSeasonPool(TEST_ENC_KEY);

    expect(pool.boxes.length).toBe(3025);
    expect(pool.totalPop).toBe(SEASON_1_TOTAL_POP);

    const mini = pool.boxes.filter((b) => b.tierId === 0);
    const pro = pool.boxes.filter((b) => b.tierId === 1);
    const whale = pool.boxes.filter((b) => b.tierId === 2);

    expect(mini.length).toBe(2500);
    expect(pro.length).toBe(500);
    expect(whale.length).toBe(25);

    for (const b of mini) {
      expect(b.totalPopAmount).toBeGreaterThanOrEqual(4500);
      expect(b.totalPopAmount).toBeLessThanOrEqual(9000);
      expect(b.maxClicks).toBe(10);
    }
    for (const b of pro) {
      expect(b.totalPopAmount).toBeGreaterThanOrEqual(45000);
      expect(b.totalPopAmount).toBeLessThanOrEqual(100000);
      expect(b.maxClicks).toBe(60);
    }
    for (const b of whale) {
      expect(b.totalPopAmount).toBeGreaterThanOrEqual(450000);
      expect(b.totalPopAmount).toBeLessThanOrEqual(1200000);
      expect(b.maxClicks).toBe(400);
    }

    const decryptedSalt = decryptSeasonSalt(pool.poolSaltEncrypted, TEST_ENC_KEY);
    expect(decryptedSalt).toBe(pool.seasonSalt);
    expect(computePoolCommitHash(pool.orderedPoolJson, decryptedSalt)).toBe(pool.poolCommitHash);
  });

  it('builds OpenZeppelin-compatible Merkle tree and verifies proofs', () => {
    const addrs = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
    ];
    const outsider = '0x4444444444444444444444444444444444444444';

    const tree = new AddressMerkleTree(addrs);
    const root = tree.getRoot();

    for (const a of addrs) {
      const proof = tree.getProof(a);
      expect(AddressMerkleTree.verify(a, proof, root)).toBe(true);
    }
    expect(AddressMerkleTree.verify(outsider, tree.getProof(outsider), root)).toBe(false);
  });

  it('verifies Telegram initData HMAC-SHA256 and JWT session lifecycle', () => {
    const botToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    const authDate = Math.floor(Date.now() / 1000);
    const userJson = JSON.stringify({ id: 987654321, username: 'pop_hunter' });

    const params = new URLSearchParams();
    params.set('auth_date', String(authDate));
    params.set('user', userJson);
    const dataCheckString = `auth_date=${authDate}\nuser=${userJson}`;
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    params.set('hash', hash);

    const verified = verifyTelegramInitData(params.toString(), botToken);
    expect(verified.valid).toBe(true);
    expect(verified.user?.id).toBe(987654321);

    // Tampered initData must fail
    const bad = verifyTelegramInitData(params.toString().replace('pop_hunter', 'hacker'), botToken);
    expect(bad.valid).toBe(false);

    // JWT sign & verify
    const jwt = signJwt({ sub: 'user_1', telegramId: '987654321' }, 'test_secret_1234567890');
    const decoded = verifyJwt(jwt, 'test_secret_1234567890');
    expect(decoded?.sub).toBe('user_1');
    expect(verifyJwt(jwt, 'wrong_secret')).toBeNull();
  });

  it('signs EIP-712 PopClaimVault vouchers verifiable by viem', async () => {
    const signerKey = generatePrivateKey();
    const signerAccount = privateKeyToAccount(signerKey);
    const recipient = '0x5555555555555555555555555555555555555555' as `0x${string}`;
    const vaultAddress = '0x6666666666666666666666666666666666666666' as `0x${string}`;
    const deadline = Math.floor(Date.now() / 1000) + 900;

    const voucher = await signPopClaimVoucher({
      recipient,
      amountPop: '12500.5',
      nonce: 0n,
      deadlineUnix: deadline,
      chainId: 56,
      verifyingContract: vaultAddress,
      signerPrivateKey: signerKey,
    });

    const valid = await verifyTypedData({
      address: signerAccount.address,
      domain: buildPopClaimDomain(56, vaultAddress),
      types: POP_CLAIM_EIP712_TYPES,
      primaryType: 'Claim',
      message: {
        recipient: voucher.recipient,
        amount: voucher.amountWei,
        nonce: 0n,
        deadline: BigInt(deadline),
      },
      signature: voucher.signature,
    });
    expect(valid).toBe(true);
  });

  it('generates 5 valid 3-choice quiz questions with fallback', async () => {
    const questions = await generateQuizQuestionsFromContent({
      title: 'POP Box 创世盲盒开启！',
      content: '在 BNB Smart Chain 上线双向社交盲盒协议，支持 X 与币安广场内容激励。',
      platform: 'X',
    });
    expect(questions.length).toBe(5);
    for (const q of questions) {
      expect(q.options.length).toBe(3);
      expect([0, 1, 2]).toContain(q.correctIndex);
    }
  });

  it('handles Fastify /health and SIWE wallet login flow end-to-end', async () => {
    const userStore = new Map<string, any>();
    const mockPrisma: any = {
      user: {
        findUnique: async ({ where }: any) => {
          if (where.walletAddress) return userStore.get(where.walletAddress) ?? null;
          if (where.id) {
            return Array.from(userStore.values()).find((u) => u.id === where.id) ?? null;
          }
          return null;
        },
        create: async ({ data }: any) => {
          const user = {
            id: `u_${userStore.size + 1}`,
            walletAddress: data.walletAddress ?? null,
            telegramId: data.telegramId ?? null,
            telegramUsername: null,
            xUsername: null,
            xFollowers: 0,
            binanceSquareUrl: null,
            squareFollowers: 0,
            squareVerified: false,
            bnbAvailable: { toString: () => '0' },
            bnbLocked: { toString: () => '0' },
            popAvailable: { toString: () => '0' },
            popPendingClaim: { toString: () => '0' },
            popClaimedTotal: { toString: () => '0' },
            riskLevel: 'NORMAL',
            priorityPasses: [],
            tgGroups: [],
          };
          if (user.walletAddress) userStore.set(user.walletAddress, user);
          return user;
        },
      },
    };

    const app = await buildApp({ prisma: mockPrisma, kv: new MemoryKVStore() });

    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.json().status).toBe('ok');

    // SIWE wallet login flow
    const walletKey = generatePrivateKey();
    const account = privateKeyToAccount(walletKey);

    const nonceRes = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/nonce?address=${account.address}`,
    });
    expect(nonceRes.statusCode).toBe(200);
    const { message } = nonceRes.json();

    const signature = await account.signMessage({ message });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/wallet-login',
      payload: { address: account.address, signature },
    });
    expect(loginRes.statusCode).toBe(200);
    const { token, walletAddress } = loginRes.json();
    expect(walletAddress).toBe(account.address);

    // Authenticated GET /api/v1/users/me
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().walletAddress).toBe(account.address);

    await app.close();
  });
});
