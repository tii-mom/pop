import {
  PANCAKESWAP_V3_INIT_SPEC,
  SEASON_1_TIERS,
  computeReferralTierLimit,
  parseSocialPostUrl,
} from '@pop-box/shared';

const STORAGE_KEY = 'pop_box_mock_state_v1';
const DEMO_WALLET = ['0x', '71c7'.repeat(10)].join('');
const DEMO_CUSTODY = ['0x', '3ab9'.repeat(10)].join('');
const DEMO_COMMIT = ['0x', '9f4e'.repeat(16)].join('');
const DEMO_X_URL_1 = ['https://', 'x.com', '/popbox/status/100001'].join('');
const DEMO_X_URL_2 = ['https://', 'x.com', '/popbox/status/100002'].join('');
const DEMO_SQ_URL_1 = ['https://', 'www.binance.com', '/en/square/post/200001'].join('');

export interface MockState {
  profile: {
    id: string;
    walletAddress: string;
    telegramId: string | null;
    telegramUsername: string | null;
    xUsername: string;
    xFollowers: number;
    binanceSquareUrl: string | null;
    squareFollowers: number;
    squareVerified: boolean;
    bnbAvailable: string;
    bnbLocked: string;
    popAvailable: string;
    popPendingClaim: string;
    popClaimedTotal: string;
    riskLevel: string;
    hasPriorityPass: boolean;
    isWhaleWhitelisted: boolean;
  };
  friendBalance?: number;
  claimedBy?: Record<string, string[]>;
  validReferrals: number;
  whalePublicOpen: boolean;
  soldCount?: number;
  walletPurchasedByTier: Record<number, number>;
  feedBoxes: Array<{
    id: string;
    seasonId: number;
    tierId: number;
    platform: 'X' | 'BINANCE_SQUARE';
    targetUrl: string;
    externalPostId: string;
    contentTitle: string;
    maxClicks: number;
    claimedClicks: number;
    remainingClicks: number;
    readerRewardPop: string;
    expiresAt: string;
    questionText: string;
    options: [string, string, string];
    correctIndex: number;
  }>;
  myBoxes: Array<{
    id: string;
    seasonId: number;
    tierId: number;
    seqIndex: number;
    totalPopAmount: string;
    maxClicks: number;
    claimedClicks: number;
    status: 'SEALED' | 'LISTED' | 'ACTIVE' | 'COMPLETED';
    targetUrl: string | null;
  }>;
  listings: Array<{
    id: string;
    boxId: string;
    seasonId: number;
    tierId: number;
    seqIndex: number;
    priceBnb: string;
    feeBnb: string;
    sellerId: string;
  }>;
}

function createInitialMockState(): MockState {
  const in72h = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  return {
    profile: {
      id: 'demo_user_1',
      walletAddress: DEMO_WALLET,
      telegramId: null,
      telegramUsername: 'pop_builder',
      xUsername: 'popbox_demo',
      xFollowers: 1850,
      binanceSquareUrl: null,
      squareFollowers: 0,
      squareVerified: false,
      bnbAvailable: '1.8500',
      bnbLocked: '0',
      popAvailable: '12450.00',
      popPendingClaim: '0',
      popClaimedTotal: '36000.00',
      riskLevel: 'NORMAL',
      hasPriorityPass: true,
      isWhaleWhitelisted: false,
    },
    validReferrals: 3,
    whalePublicOpen: false,
    soldCount: 842,
    walletPurchasedByTier: { 0: 1, 1: 0, 2: 0 },
    feedBoxes: [
      {
        id: 'box_whale_demo',
        seasonId: 1,
        tierId: 2,
        platform: 'X',
        targetUrl: DEMO_X_URL_1,
        externalPostId: '100001',
        contentTitle: '深度拆解 POP 果实 创世 100 BNB 经济模型：80% 底座建池防跌穿机制',
        maxClicks: 400,
        claimedClicks: 128,
        remainingClicks: 272,
        readerRewardPop: '525.00',
        expiresAt: in72h,
        questionText: 'POP 果实 第一期首发募集的 BNB 中有多少比例即时转入 LP 建池钱包？',
        options: ['80% 即时转入 LP 钱包建池', '仅 10% 用于建池', '全部留在合约内锁死'],
        correctIndex: 0,
      },
      {
        id: 'box_pro_demo',
        seasonId: 1,
        tierId: 1,
        platform: 'BINANCE_SQUARE',
        targetUrl: DEMO_SQ_URL_1,
        externalPostId: '200001',
        contentTitle: '币安广场创作者实战：用 POP 黄香蕉实现 60 人高质量共读互动',
        maxClicks: 60,
        claimedClicks: 21,
        remainingClicks: 39,
        readerRewardPop: '320.00',
        expiresAt: in72h,
        questionText: '持有者分享内容 POP 果实瞬间，可立即解锁果实多少比例的 $POP？',
        options: ['立即解锁 20%，其余随读者答题双向释放', '必须等 72 小时结束才能领', '立即解锁 100%'],
        correctIndex: 0,
      },
      {
        id: 'box_mini_demo',
        seasonId: 1,
        tierId: 0,
        platform: 'X',
        targetUrl: DEMO_X_URL_2,
        externalPostId: '100002',
        contentTitle: '0.01 BNB 青苹果体验：10 次点击轻松点满拿 70% + 下期优先购',
        maxClicks: 10,
        claimedClicks: 4,
        remainingClicks: 6,
        readerRewardPop: '198.00',
        expiresAt: in72h,
        questionText: '青苹果点满 10 次有效答题后，持有者累计可获得果实多少比例的 $POP？',
        options: ['累计 70%（激活 20% + 读者答题解锁 50%）', '仅 30%', '50%'],
        correctIndex: 0,
      },
    ],
    myBoxes: [
      {
        id: 'my_sealed_demo',
        seasonId: 1,
        tierId: 1,
        seqIndex: 88,
        totalPopAmount: '68000',
        maxClicks: 60,
        claimedClicks: 0,
        status: 'SEALED',
        targetUrl: null,
      },
      {
        id: 'box_mini_demo',
        seasonId: 1,
        tierId: 0,
        seqIndex: 412,
        totalPopAmount: '6600',
        maxClicks: 10,
        claimedClicks: 4,
        status: 'ACTIVE',
        targetUrl: DEMO_X_URL_2,
      },
    ],
    listings: [
      {
        id: 'list_demo_1',
        boxId: 'mkt_box_1',
        seasonId: 1,
        tierId: 0,
        seqIndex: 1024,
        priceBnb: '0.014',
        feeBnb: '0.00056',
        sellerId: 'seller_a',
      },
      {
        id: 'list_demo_2',
        boxId: 'mkt_box_2',
        seasonId: 1,
        tierId: 1,
        seqIndex: 209,
        priceBnb: '0.135',
        feeBnb: '0.0054',
        sellerId: 'seller_b',
      },
      {
        id: 'list_demo_3',
        boxId: 'mkt_box_3',
        seasonId: 1,
        tierId: 2,
        seqIndex: 7,
        priceBnb: '1.38',
        feeBnb: '0.0552',
        sellerId: 'seller_c',
      },
    ],
  };
}

export function loadMockState(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    // ignore
  }
  const init = createInitialMockState();
  saveMockState(init);
  return init;
}

export function saveMockState(state: MockState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetMockState(): MockState {
  const init = createInitialMockState();
  saveMockState(init);
  return init;
}

const mockAttempts = new Map<string, { boxId: string; correctIndex: number }>();

export function mockSimulateReferral(): MockState {
  const state = loadMockState();
  state.validReferrals += 1;
  saveMockState(state);
  return state;
}

export function mockMintBox(tierId: number): { txHash: string; state: MockState } {
  const state = loadMockState();
  const tier = SEASON_1_TIERS.find((t) => t.tierId === tierId);
  if (!tier) throw new Error('无效档位');

  const limit = computeReferralTierLimit(tierId, state.validReferrals, state.whalePublicOpen);
  const bought = state.walletPurchasedByTier[tierId] ?? 0;
  if (bought + 1 > limit) {
    throw new Error(
      tierId === 2
        ? `橙子需邀请满 5 人解锁（当前已邀 ${state.validReferrals}/5 人）`
        : `已达当前钱包限购上限（${bought}/${limit}），邀请好友认购果实可即时提升额度`
    );
  }

  const price = Number(tier.priceBnb);
  const avail = Number(state.profile.bnbAvailable);
  if (avail < price) {
    throw new Error(`模拟 BNB 余额不足（当前 ${avail.toFixed(4)} BNB，需要 ${price} BNB）`);
  }

  state.profile.bnbAvailable = (avail - price).toFixed(4);
  state.walletPurchasedByTier[tierId] = bought + 1;
  state.soldCount = (state.soldCount ?? 842) + 1;
  state.myBoxes.unshift({
    id: `mint_${Date.now()}`,
    seasonId: 1,
    tierId,
    seqIndex: Math.floor(Math.random() * tier.maxSupply) + 1,
    totalPopAmount: String(tier.avgPop),
    maxClicks: tier.maxClicks,
    claimedClicks: 0,
    status: 'SEALED',
    targetUrl: null,
  });

  saveMockState(state);
  return { txHash: `0xdemo${Date.now().toString(16)}`, state };
}

export function mockClaimPop(): { txHash: string; claimed: string; state: MockState } {
  const state = loadMockState();
  const avail = Number(state.profile.popAvailable);
  if (avail <= 0) throw new Error('当前无可领取的 $POP');

  state.profile.popClaimedTotal = (Number(state.profile.popClaimedTotal) + avail).toFixed(2);
  state.profile.popAvailable = '0.00';
  saveMockState(state);

  return { txHash: `0xclaim${Date.now().toString(16)}`, claimed: avail.toFixed(2), state };
}

export async function handleMockApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  await new Promise((r) => setTimeout(r, 120));

  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? (JSON.parse(String(options.body)) as Record<string, any>) : {};
  const [cleanPath, queryStr] = path.split('?');
  const qs = new URLSearchParams(queryStr || '');
  const state = loadMockState();
  const invited = new URLSearchParams(window.location.search).get('boxId');
  const reader = invited ? 'demo_friend' : state.profile.id;

  if (cleanPath === '/users/me' && method === 'GET') {
    return (invited ? { ...state.profile, id: reader, popAvailable: String(state.friendBalance ?? 0) } : state.profile) as unknown as T;
  }

  if (cleanPath === '/seasons/current') {
    const now = Date.now();
    return {
      id: 1,
      status: 'PUBLIC',
      targetBnb: '100',
      totalPopAllocated: '60000000',
      refPriceBnb: '0.000002',
      poolCommitHash: DEMO_COMMIT,
      priorityStartAt: new Date(now - 3600 * 1000).toISOString(),
      publicStartAt: new Date(now - 1800 * 1000).toISOString(),
      endAt: new Date(now + 6 * 86400 * 1000).toISOString(),
      tiers: SEASON_1_TIERS,
      pancakeV3Spec: PANCAKESWAP_V3_INIT_SPEC,
    } as unknown as T;
  }

  if (cleanPath === '/seasons/transparency') {
    const sold = state.soldCount ?? 842;
    return {
      seasonId: 1,
      poolCommitHash: DEMO_COMMIT,
      boxes: { dbSoldCount: sold, onChainSoldTotal: sold, inSync: true },
      custody: {
        hotCustodyWallet: DEMO_CUSTODY,
        hotCustodyBnbBalance: '4.12',
        totalUserBnbAvailable: '3.98',
      },
    } as unknown as T;
  }

  if (/^\/seasons\/\d+\/proof$/.test(cleanPath)) {
    return {
      seasonId: 1,
      walletAddress: state.profile.walletAddress,
      priorityEligible: true,
      priorityProof: [],
      whaleEligible: state.validReferrals >= 5 || state.whalePublicOpen,
      whaleProof: [],
    } as unknown as T;
  }

  if (cleanPath === '/boxes/feed') {
    const platform = qs.get('platform');
    const tierId = qs.get('tierId');
    let items = state.feedBoxes.filter(b => b.remainingClicks > 0 && Date.parse(b.expiresAt) > Date.now());
    if (qs.get('id')) items = items.filter(b => b.id === qs.get('id'));
    if (platform) items = items.filter((b) => b.platform === platform);
    if (tierId !== null && tierId !== '') items = items.filter((b) => b.tierId === Number(tierId));
    return { items: items.map(b => ({ ...b, sharer: state.myBoxes.some(owned => owned.id === b.id) ? state.profile.xUsername : null, remainingReaderPop: (Number(b.readerRewardPop) * b.remainingClicks).toFixed(2) })) } as unknown as T;
  }

  if (cleanPath === '/boxes/my') {
    return { boxes: state.myBoxes } as unknown as T;
  }

  const activateMatch = /^\/boxes\/([^/]+)\/activate$/.exec(cleanPath);
  if (activateMatch && method === 'POST') {
    const boxId = activateMatch[1];
    const parsed = parseSocialPostUrl(String(body.targetUrl || ''));
    if (!parsed) throw new Error('请输入有效的 X 推文链接或币安广场帖子链接');
    const box = state.myBoxes.find((b) => b.id === boxId);
    if (!box || box.status !== 'SEALED') throw new Error('果实不存在或不是完整状态');

    box.status = 'ACTIVE';
    box.targetUrl = parsed.canonicalUrl;
    const instant = Number(box.totalPopAmount) * 0.2;
    const readerPerClick = ((Number(box.totalPopAmount) * 0.3) / Math.max(1, box.maxClicks)).toFixed(2);
    const snapshot = String(body.contentSnapshot || '').trim();
    const title = snapshot.slice(0, 42) || `${parsed.platform} 精选共读帖子 #${parsed.externalPostId}`;

    state.feedBoxes.unshift({
      id: box.id,
      seasonId: box.seasonId,
      tierId: box.tierId,
      platform: parsed.platform,
      targetUrl: parsed.canonicalUrl,
      externalPostId: parsed.externalPostId,
      contentTitle: title,
      maxClicks: box.maxClicks,
      claimedClicks: 0,
      remainingClicks: box.maxClicks,
      readerRewardPop: readerPerClick,
      expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      questionText: `根据「${title.slice(0, 20)}」核心观点，以下哪项描述最准确？`,
      options: ['符合原文核心观点与数据拆解', '与原文结论完全相反', '文中未提及任何相关内容'],
      correctIndex: 0,
    });

    state.profile.popAvailable = (Number(state.profile.popAvailable) + instant).toFixed(2);
    state.profile.hasPriorityPass = true;
    saveMockState(state);

    return { boxId: box.id, status: 'ACTIVE', instantPopUnlocked: instant.toFixed(2), priorityPassGrantedForSeason: box.seasonId + 1 } as unknown as T;
  }

  const openStartMatch = /^\/open\/([^/]+)\/start$/.exec(cleanPath);
  if (openStartMatch && method === 'POST') {
    const boxId = openStartMatch[1];
    const box = state.feedBoxes.find((b) => b.id === boxId);
    if (!box) throw new Error('未找到该活跃果实');

    if (!box.remainingClicks || Date.parse(box.expiresAt) <= Date.now()) throw new Error('这颗果实已结束领取');
    if (state.myBoxes.some(b => b.id === boxId) && !invited) throw new Error('请从朋友视角体验阅读领取');
    if (state.claimedBy?.[boxId]?.includes(reader)) throw new Error('你已经领过这颗果实');
    const attemptToken = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    mockAttempts.set(attemptToken, { boxId, correctIndex: box.correctIndex });

    return {
      attemptToken,
      boxId: box.id,
      targetUrl: box.targetUrl,
      questionText: box.questionText,
      options: box.options,
      minReadDurationMs: 5000,
      requiresTurnstile: false,
    } as unknown as T;
  }

  const openSubmitMatch = /^\/open\/([^/]+)\/submit$/.exec(cleanPath);
  if (openSubmitMatch && method === 'POST') {
    const boxId = openSubmitMatch[1];
    const attempt = mockAttempts.get(String(body.attemptToken || ''));
    if (!attempt || attempt.boxId !== boxId) throw new Error('答题凭证已失效，请重新打开果实');
    const box = state.feedBoxes.find((b) => b.id === boxId);
    if (!box) throw new Error('果实不存在');

    if (Number(body.selectedIndex) !== attempt.correctIndex) {
      return { correct: false, quizWrongStreak: 1 } as unknown as T;
    }

    mockAttempts.delete(String(body.attemptToken));
    if (!box.remainingClicks || Date.parse(box.expiresAt) <= Date.now() || state.claimedBy?.[boxId]?.includes(reader)) throw new Error('这份奖励已无法领取');
    state.claimedBy ??= {};
    (state.claimedBy[boxId] ??= []).push(reader);
    const reward = Number(box.readerRewardPop);
    box.claimedClicks = Math.min(box.maxClicks, box.claimedClicks + 1);
    box.remainingClicks = Math.max(0, box.maxClicks - box.claimedClicks);
    const owned = state.myBoxes.find(b => b.id === boxId);
    const ownerPop = owned ? Number(owned.totalPopAmount) * 0.5 / owned.maxClicks : 0;
    if (owned) {
      owned.claimedClicks = box.claimedClicks;
      if (!box.remainingClicks) owned.status = 'COMPLETED';
    }
    if (invited) state.friendBalance = (state.friendBalance ?? 0) + reward;
    state.profile.popAvailable = (Number(state.profile.popAvailable) + ownerPop + (invited ? 0 : reward)).toFixed(2);
    saveMockState(state);

    return {
      correct: true,
      readerPop: reward.toFixed(2),
      ownerPop: ownerPop.toFixed(2), claimedClicks: box.claimedClicks, maxClicks: box.maxClicks,
      readerBalanceAfter: invited ? String(state.friendBalance) : state.profile.popAvailable,
    } as unknown as T;
  }

  if (cleanPath === '/market/listings') {
    const tierId = qs.get('tierId');
    const listings =
      tierId !== null && tierId !== ''
        ? state.listings.filter((l) => l.tierId === Number(tierId))
        : state.listings;
    const floors: Record<number, string | null> = { 0: null, 1: null, 2: null };
    for (const l of state.listings) {
      if (floors[l.tierId] === null || Number(l.priceBnb) < Number(floors[l.tierId])) {
        floors[l.tierId] = l.priceBnb;
      }
    }
    return { feeBps: 400, floors, listings } as unknown as T;
  }

  if (cleanPath === '/market/list' && method === 'POST') {
    const boxId = String(body.boxId || '');
    const priceNum = Number(body.priceBnb);
    if (!boxId || !Number.isFinite(priceNum) || priceNum <= 0) {
      throw new Error('请输入有效的挂单 BNB 价格');
    }
    const box = state.myBoxes.find((b) => b.id === boxId);
    if (!box || box.status !== 'SEALED') {
      throw new Error('仅完整果实支持挂单出售');
    }

    const feeBnb = (priceNum * 0.04).toFixed(5);
    const listingId = `list_${Date.now()}`;
    box.status = 'LISTED';
    state.listings.unshift({
      id: listingId,
      boxId: box.id,
      seasonId: box.seasonId,
      tierId: box.tierId,
      seqIndex: box.seqIndex,
      priceBnb: String(body.priceBnb),
      feeBnb,
      sellerId: state.profile.id,
    });
    saveMockState(state);

    return {
      listingId,
      boxId: box.id,
      priceBnb: String(body.priceBnb),
      feeBnb,
      status: 'OPEN',
    } as unknown as T;
  }

  if (cleanPath === '/market/cancel' && method === 'POST') {
    const listingId = String(body.listingId || '');
    const idx = state.listings.findIndex(
      (l) => l.id === listingId && l.sellerId === state.profile.id
    );
    if (idx === -1) throw new Error('未找到可撤销的挂单');

    const [removed] = state.listings.splice(idx, 1);
    const box = state.myBoxes.find((b) => b.id === removed.boxId);
    if (box) box.status = 'SEALED';
    saveMockState(state);

    return { cancelled: true, listingId } as unknown as T;
  }

  if (cleanPath === '/market/buy' && method === 'POST') {
    const idx = state.listings.findIndex((l) => l.id === body.listingId);
    if (idx === -1) throw new Error('挂单已被抢购');
    const listing = state.listings[idx];
    if (listing.sellerId === state.profile.id) {
      throw new Error('不能购买自己挂出的果实，可直接撤单');
    }
    const price = Number(listing.priceBnb);
    const bnb = Number(state.profile.bnbAvailable);
    if (bnb < price) throw new Error('站内 BNB 余额不足');

    state.profile.bnbAvailable = (bnb - price).toFixed(4);
    state.listings.splice(idx, 1);
    const tier = SEASON_1_TIERS.find((t) => t.tierId === listing.tierId)!;
    state.myBoxes.unshift({
      id: listing.boxId,
      seasonId: listing.seasonId,
      tierId: listing.tierId,
      seqIndex: listing.seqIndex,
      totalPopAmount: String(tier.avgPop),
      maxClicks: tier.maxClicks,
      claimedClicks: 0,
      status: 'SEALED',
      targetUrl: null,
    });
    saveMockState(state);

    return { boxId: listing.boxId, priceBnb: listing.priceBnb } as unknown as T;
  }

  if (cleanPath === '/wallet/deposit-address') {
    return {
      depositAddress: DEMO_CUSTODY,
      expectedFromWallet: state.profile.walletAddress,
      chainId: 56,
    } as unknown as T;
  }

  if (cleanPath === '/wallet/withdraw-bnb' && method === 'POST') {
    const amt = Number(body.amountBnb);
    const bnb = Number(state.profile.bnbAvailable);
    if (isNaN(amt) || amt < 0.02) throw new Error('最低提现 0.02 BNB');
    if (amt > bnb) throw new Error('站内 BNB 余额不足');
    state.profile.bnbAvailable = (bnb - amt).toFixed(4);
    saveMockState(state);
    return {
      withdrawalId: `wd_${Date.now()}`,
      amountBnb: amt.toFixed(4),
      status: amt > 0.5 ? 'PENDING_REVIEW' : 'PENDING_AUTO',
    } as unknown as T;
  }

  if (cleanPath === '/users/verify-square' && method === 'POST') {
    state.profile.binanceSquareUrl = String(body.binanceSquareUrl || '');
    state.profile.squareFollowers = Number(body.squareFollowers || 1000);
    state.profile.squareVerified = true;
    saveMockState(state);
    return { squareVerified: true } as unknown as T;
  }

  throw new Error(`Mock endpoint not implemented: ${method} ${path}`);
}
