import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { parseEther, zeroAddress } from 'viem';
import { useReadContract, useWriteContract } from 'wagmi';
import {
  CheckCircle2,
  Copy,
  Check,
  Users,
  UserPlus,
  ChevronDown,
  Crown,
} from 'lucide-react';
import {
  SEASON_1_TIERS,
  PANCAKESWAP_V3_INIT_SPEC,
  computeReferralTierLimit,
} from '@pop-box/shared';
import { IS_MOCK_MODE, apiFetch } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { loadMockState, mockMintBox, mockSimulateReferral } from '../lib/mockApi';
import { POP_PRIMARY_SALE_ABI, POP_PRIMARY_SALE_ADDRESS } from '../lib/contracts';
import { getSavedReferrer } from '../hooks/usePopAuth';
import { FlipTierCard } from '../components/FlipTierCard';
import { ChainDiamondIcon } from '../components/BrandIcons';
import { InlineAlert, type AlertMessage } from '../components/InlineAlert';
import { useArtPack } from '../lib/artPack';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  AwakenItem,
} from '../components/DataAwakening';

interface SeasonInfo {
  id: number;
  status: string;
  targetBnb: string;
  totalPopAllocated: string;
  poolCommitHash: string;
}

interface ProofResp {
  priorityEligible: boolean;
  priorityProof: `0x${string}`[];
  whaleEligible: boolean;
  whaleProof: `0x${string}`[];
}

interface TransparencyResp {
  poolCommitHash: string | null;
  boxes: { dbSoldCount: number; onChainSoldTotal: number | null; inSync: boolean | null };
  custody: {
    hotCustodyWallet: string;
    hotCustodyBnbBalance: string | null;
    totalUserBnbAvailable: string;
  };
}

const TOTAL_SEASON_BOXES = SEASON_1_TIERS.reduce((sum, t) => sum + t.maxSupply, 0);

export function MintPage({
  isAuthenticated,
  walletAddress,
  onMinted,
}: {
  isAuthenticated: boolean;
  walletAddress: string | null;
  onMinted: () => void;
}) {
  const { pack } = useArtPack();
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [proof, setProof] = useState<ProofResp | null>(null);
  const [transparency, setTransparency] = useState<TransparencyResp | null>(null);
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [showTransparency, setShowTransparency] = useState(false);

  const [mockRefs, setMockRefs] = useState(() => (IS_MOCK_MODE ? loadMockState().validReferrals : 0));
  const [mockWhaleOpen] = useState(() => (IS_MOCK_MODE ? loadMockState().whalePublicOpen : false));
  const [mockBought, setMockBought] = useState<Record<number, number>>(() =>
    IS_MOCK_MODE ? loadMockState().walletPurchasedByTier : { 0: 0, 1: 0, 2: 0 }
  );

  const { writeContractAsync, isPending } = useWriteContract();
  const savedReferrer = getSavedReferrer();

  const { data: onChainRefs } = useReadContract({
    address: POP_PRIMARY_SALE_ADDRESS,
    abi: POP_PRIMARY_SALE_ABI,
    functionName: 'validReferrals',
    args: [BigInt(season?.id ?? 1), (walletAddress || zeroAddress) as `0x${string}`],
    query: {
      enabled: !IS_MOCK_MODE && Boolean(walletAddress) && POP_PRIMARY_SALE_ADDRESS !== zeroAddress,
    },
  });

  const { data: onChainWhaleOpen } = useReadContract({
    address: POP_PRIMARY_SALE_ADDRESS,
    abi: POP_PRIMARY_SALE_ABI,
    functionName: 'whalePublicOpen',
    args: [BigInt(season?.id ?? 1)],
    query: {
      enabled: !IS_MOCK_MODE && POP_PRIMARY_SALE_ADDRESS !== zeroAddress,
    },
  });

  const validReferrals = IS_MOCK_MODE ? mockRefs : Number(onChainRefs ?? 0);
  const whalePublicOpen = IS_MOCK_MODE ? mockWhaleOpen : Boolean(onChainWhaleOpen ?? false);

  const loadTransparency = useCallback(() => {
    apiFetch<TransparencyResp>('/seasons/transparency').then(setTransparency).catch(() => null);
  }, []);

  useEffect(() => {
    apiFetch<SeasonInfo>('/seasons/current').then(setSeason).catch(() => null);
    loadTransparency();
  }, [loadTransparency]);

  useEffect(() => {
    if (!isAuthenticated || !season) return;
    apiFetch<ProofResp>(`/seasons/${season.id}/proof`).then(setProof).catch(() => null);
  }, [isAuthenticated, season]);

  const inviteUrl = walletAddress
    ? `${window.location.origin}/mint?ref=${walletAddress}`
    : `${window.location.origin}/mint`;

  const handleCopyInvite = async () => {
    const ok = await copyText(inviteUrl);
    if (ok) {
      setCopiedRef(true);
      window.setTimeout(() => setCopiedRef(false), 1800);
    }
  };

  const handleSimulateReferral = () => {
    const next = mockSimulateReferral();
    setMockRefs(next.validReferrals);
    setAlert({
      type: 'ok',
      text: `演示模式：已新增 1 位首购好友，当前有效邀请 ${next.validReferrals} 人。`,
    });
  };

  const handleMint = async (tierId: number, priceBnb: string) => {
    setAlert(null);
    if (IS_MOCK_MODE) {
      try {
        const res = mockMintBox(tierId);
        setMockBought({ ...res.state.walletPurchasedByTier });
        loadTransparency();
        setAlert({
          type: 'ok',
          text: `认购成功（${res.txHash.slice(0, 14)}...），果实已存入「我的资产」。`,
        });
        onMinted();
      } catch (err) {
        setAlert({ type: 'err', text: err instanceof Error ? err.message : '模拟认购失败' });
      }
      return;
    }

    if (/^0x0{40}$/i.test(POP_PRIMARY_SALE_ADDRESS)) {
      setAlert({ type: 'err', text: '当前网络尚未配置果实认购合约。' });
      return;
    }
    try {
      const seasonId = BigInt(season?.id ?? 1);
      const hash = await writeContractAsync({
        address: POP_PRIMARY_SALE_ADDRESS,
        abi: POP_PRIMARY_SALE_ABI,
        functionName: 'buyBox',
        args: [
          seasonId,
          tierId,
          1,
          savedReferrer,
          proof?.priorityProof ?? [],
          proof?.whaleProof ?? [],
        ],
        value: parseEther(priceBnb),
      });
      setAlert({
        type: 'ok',
        text: `交易已广播：${hash.slice(0, 14)}...（3 个区块确认后自动入账）`,
      });
      loadTransparency();
      onMinted();
    } catch (err) {
      setAlert({ type: 'err', text: err instanceof Error ? err.message : '认购交易取消或失败' });
    }
  };

  const miniLimit = computeReferralTierLimit(0, validReferrals, whalePublicOpen);
  const proLimit = computeReferralTierLimit(1, validReferrals, whalePublicOpen);
  const whaleLimit = computeReferralTierLimit(2, validReferrals, whalePublicOpen);
  const remainingForWhale = Math.max(0, 5 - validReferrals);
  const whaleUnlocked = whaleLimit > 0;

  const soldCount = transparency?.boxes.dbSoldCount ?? 0;
  const soldPercent = Math.min(100, (soldCount / TOTAL_SEASON_BOXES) * 100);

  return (
    <div className="space-y-5">
      {/* Season 1 Arcade Cabinet Showcase Header with Generated Hero Banner */}
      <AwakenItem index={0}>
        <section className="overflow-hidden rounded-2xl border border-pop-border bg-pop-card">
          {/* Widescreen 3-Tier Studio Banner */}
          <div className="relative h-48 sm:h-56 w-full overflow-hidden border-b border-pop-border bg-[#07090E]">
            <img
              src={pack.seasonBannerSrc}
              alt="Season 1 三档果实阵列"
              className="h-full w-full object-cover object-[center_32%]"
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, rgba(8,10,15,0.92) 0%, rgba(8,10,15,0.45) 48%, rgba(8,10,15,0.12) 100%)',
              }}
            />
            <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/60 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-pop-lime" />
                  SEASON {season?.id ?? 1} · 首季果园
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/60 backdrop-blur-md px-2 py-1 text-[10px] font-mono text-gray-300">
                  <ChainDiamondIcon className="w-3 h-3 text-pop-lime" />
                  BSC · 80% 建池
                </span>
              </div>

              <div className="max-w-[65%]">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
                  邀请提额 · 果实首发
                </h1>
                <p className="text-[11px] text-gray-300 mt-1">
                  点卡片「详情」翻转查看奖励拆解
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* 01 Data Awakening Metrics */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-pop-border bg-pop-bg px-3 py-2.5">
                <div className="text-[11px] text-gray-400">创世目标池</div>
                <div className="text-base font-black text-white mt-0.5">
                  <AnimatedNumber value={Number(season?.targetBnb ?? 100)} suffix=" BNB" />
                </div>
              </div>
              <div className="rounded-xl border border-pop-border bg-pop-bg px-3 py-2.5">
                <div className="text-[11px] text-gray-400">赛季奖池</div>
                <div className="text-base font-black text-pop-lime mt-0.5">
                  <AnimatedNumber value={6000} suffix=" 万" />
                </div>
              </div>
              <div className="rounded-xl border border-pop-border bg-pop-bg px-3 py-2.5">
                <div className="text-[11px] text-gray-400">已认购</div>
                <div className="text-base font-black text-white mt-0.5">
                  <AnimatedNumber value={soldCount} />
                  <span className="text-[11px] font-normal text-gray-500">/{TOTAL_SEASON_BOXES}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-gray-400 tabular-nums">
                <span>创世认购进度</span>
                <span className="text-white font-semibold">{soldPercent.toFixed(1)}%</span>
              </div>
              <AnimatedProgressBar percent={soldPercent} color="#B8FF2C" heightClassName="h-1.5" />
            </div>
          </div>
        </section>
      </AwakenItem>

      {/* Referral 5-Step Unlock Rail */}
      <AwakenItem index={1}>
        <section className="rounded-2xl border border-pop-border bg-pop-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Users className="w-4 h-4 text-gray-400" />
              邀请解锁进度
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                whaleUnlocked
                  ? 'bg-[#FF7600]/20 text-[#C77DFF] border border-[#FF7600]/40'
                  : 'bg-pop-elevated text-gray-300 border border-pop-border'
              }`}
            >
              {whaleUnlocked ? (
                <>
                  <Crown className="w-3 h-3" /> 已解锁橙子
                </>
              ) : (
                `已邀 ${validReferrals}/5 · 差 ${remainingForWhale} 人解锁橙子`
              )}
            </span>
          </div>

          {/* 5-Node Visual Milestone Track */}
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((step) => {
              const reached = validReferrals >= step;
              const isFinal = step === 5;
              return (
                <div key={step} className="space-y-1">
                  <div
                    className={`h-1.5 rounded-full transition-colors duration-300 ${
                      reached
                        ? isFinal
                          ? 'bg-[#FF7600]'
                          : 'bg-pop-lime'
                        : 'bg-white/[0.08]'
                    }`}
                  />
                  <div className="flex items-center justify-between text-[10px] tabular-nums">
                    <span className={reached ? 'text-white font-semibold' : 'text-gray-500'}>
                      {step}人
                    </span>
                    {isFinal && (
                      <Crown
                        className={`w-3 h-3 ${reached ? 'text-[#C77DFF]' : 'text-gray-600'}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Copy Invite Link */}
          <div className="flex items-center gap-2 rounded-xl bg-pop-bg border border-pop-border p-1.5 pl-3">
            <span className="flex-1 truncate font-mono text-[11px] text-gray-400">
              {inviteUrl}
            </span>
            <button
              type="button"
              onClick={handleCopyInvite}
              className="arcade-btn shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs"
            >
              {copiedRef ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedRef ? '已复制' : '复制链接'}
            </button>
          </div>

          {savedReferrer !== zeroAddress && (
            <div className="text-[11px] text-gray-400 font-mono">
              已绑定邀请人：{savedReferrer.slice(0, 8)}...{savedReferrer.slice(-6)}
            </div>
          )}

          {/* 3-Tier Compact Cap Indicators */}
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-xl bg-pop-bg border border-pop-border p-2.5 space-y-1.5">
              <div className="flex justify-between font-semibold">
                <span className="text-gray-400">青苹果上限</span>
                <span className="text-[#FFD43B] tabular-nums">
                  <AnimatedNumber value={miniLimit} />/20
                </span>
              </div>
              <AnimatedProgressBar percent={(miniLimit / 20) * 100} color="#FFD43B" heightClassName="h-1" />
            </div>

            <div className="rounded-xl bg-pop-bg border border-pop-border p-2.5 space-y-1.5">
              <div className="flex justify-between font-semibold">
                <span className="text-gray-400">黄香蕉上限</span>
                <span className="text-[#FF6B00] tabular-nums">
                  <AnimatedNumber value={proLimit} />/5
                </span>
              </div>
              <AnimatedProgressBar percent={(proLimit / 5) * 100} color="#FF6B00" heightClassName="h-1" />
            </div>

            <div className="rounded-xl bg-pop-bg border border-pop-border p-2.5 space-y-1.5">
              <div className="flex justify-between font-semibold">
                <span className="text-gray-400">橙子资格</span>
                <span className="text-[#FF7600] tabular-nums">
                  <AnimatedNumber value={whaleLimit} />/1
                </span>
              </div>
              <AnimatedProgressBar
                percent={Math.min(100, (validReferrals / 5) * 100)}
                color="#FF7600"
                heightClassName="h-1"
              />
            </div>
          </div>

          {IS_MOCK_MODE && (
            <button
              type="button"
              onClick={handleSimulateReferral}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-pop-border bg-pop-elevated py-2 text-xs font-semibold text-gray-200 hover:border-pop-borderHover hover:text-white transition"
            >
              <UserPlus className="w-3.5 h-3.5 text-pop-lime" /> 演示：模拟 +1 位好友首购
            </button>
          )}
        </section>
      </AwakenItem>

      <InlineAlert alert={alert} onDismiss={() => setAlert(null)} />

      {/* 03 3D Hover & Flip Tier Cards (Signature Design #2) */}
      <div className="space-y-3">
        {SEASON_1_TIERS.map((tier, index) => {
          const cap = computeReferralTierLimit(tier.tierId, validReferrals, whalePublicOpen);
          const bought = IS_MOCK_MODE ? (mockBought[tier.tierId] ?? 0) : 0;
          const locked = cap === 0;

          return (
            <AwakenItem key={tier.tierId} index={index + 2}>
              <FlipTierCard
                tier={tier}
                cap={cap}
                bought={bought}
                showBought={IS_MOCK_MODE}
                soldOut={season?.status === 'SOLD_OUT' || season?.status === 'SETTLED' || soldCount >= TOTAL_SEASON_BOXES}
                locked={locked}
                remainingForWhale={remainingForWhale}
                isPending={isPending}
                onMint={handleMint}
              />
            </AwakenItem>
          );
        })}
      </div>

      {/* Collapsible On-chain Transparency & V3 Pool Spec */}
      <div className="rounded-2xl border border-pop-border bg-pop-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTransparency((prev) => !prev)}
          className="w-full flex items-center justify-between px-4 py-3.5 text-xs font-semibold text-gray-300 hover:text-white transition"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-pop-lime" />
            链上透明存证与 PancakeSwap V3 建池参数
          </span>
          <ChevronDown
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
              showTransparency ? 'rotate-180' : ''
            }`}
          />
        </button>

        <AnimatePresence initial={false}>
          {showTransparency && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden border-t border-pop-border"
            >
              <div className="p-4 space-y-3 text-xs">
                <div>
                  <div className="text-[11px] text-gray-500">一番赏 Commit Hash</div>
                  <div className="font-mono text-[11px] text-gray-300 break-all mt-0.5">
                    {season?.poolCommitHash ?? transparency?.poolCommitHash ?? '待开售上链写入'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-pop-bg border border-pop-border p-2.5">
                    <div className="text-[11px] text-gray-500">DB / 链上已售校验</div>
                    <div className="font-bold text-white mt-0.5 tabular-nums">
                      {transparency?.boxes.dbSoldCount ?? 0} / {transparency?.boxes.onChainSoldTotal ?? '—'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-pop-bg border border-pop-border p-2.5">
                    <div className="text-[11px] text-gray-500">V3 初始开盘价</div>
                    <div className="font-bold text-pop-lime mt-0.5 tabular-nums">
                      {PANCAKESWAP_V3_INIT_SPEC.initialPriceBnbPerPop} BNB
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
