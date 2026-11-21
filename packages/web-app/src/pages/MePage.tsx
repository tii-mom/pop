import { FruitBite } from '../components/FruitBite';
import { fruitImage } from '../lib/artPack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWriteContract } from 'wagmi';
import {
  Send,
  ShieldCheck,
  Copy,
  Check,
  ChevronDown,
  Tag,
  Sparkles,
  X,
} from 'lucide-react';
import { SEASON_1_TIERS, BNB_CUSTODY_LIMITS } from '@pop-box/shared';
import { IS_MOCK_MODE, apiFetch } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { useArtPack } from '../lib/artPack';
import { mockClaimPop } from '../lib/mockApi';
import { POP_CLAIM_VAULT_ABI, POP_CLAIM_VAULT_ADDRESS } from '../lib/contracts';
import type { MeProfile } from '../hooks/usePopAuth';
import { BoxVisual, getTierVisualMeta } from '../components/BoxVisual';
import { ChainDiamondIcon, SquareLogoIcon } from '../components/BrandIcons';
import { EmptyBoxState } from '../components/EmptyBoxState';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  AwakenItem,
} from '../components/DataAwakening';
import { SlidingTabs, type SlidingTabItem } from '../components/SlidingTabs';
import { InlineAlert, type AlertMessage } from '../components/InlineAlert';

interface MyBox {
  id: string;
  seasonId: number;
  tierId: number;
  seqIndex: number;
  totalPopAmount: string;
  maxClicks: number;
  claimedClicks: number;
  status: string;
  targetUrl: string | null;
}

interface OpenListing {
  id: string;
  boxId: string;
  priceBnb: string;
  sellerId: string;
}

type BoxFilterKey = 'ALL' | 'SEALED' | 'LISTED' | 'ACTIVE';
type SealedActionTab = 'ACTIVATE' | 'LIST';

const STATUS_META: Record<string, { label: string; className: string }> = {
  SEALED: { label: '完整', className: 'bg-pop-elevated text-white border-pop-borderHover' },
  LISTED: { label: '挂单中', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  ACTIVE: { label: '进行中', className: 'bg-pop-lime/15 text-pop-lime border-pop-lime/30' },
  EXPIRED: { label: '已过期', className: 'text-gray-400' },
  COMPLETED: { label: '已领完', className: 'bg-white/5 text-gray-400 border-pop-border' },
};

const SEALED_ACTION_TABS: readonly SlidingTabItem<SealedActionTab>[] = [
  { key: 'ACTIVATE', label: '分享内容' },
  { key: 'LIST', label: '集市挂单出售' },
];

export function MePage({
  profile,
  onLoginWallet,
  onRefreshProfile,
}: {
  profile: MeProfile | null;
  onLoginWallet: () => void;
  onRefreshProfile: () => void;
}) {

  const { pack } = useArtPack();
  const [boxes, setBoxes] = useState<MyBox[]>([]);
  const [myListingsByBoxId, setMyListingsByBoxId] = useState<Record<string, OpenListing>>({});
  const [boxFilter, setBoxFilter] = useState<BoxFilterKey>('ALL');
  const [firstBite, setFirstBite] = useState<{ id: string; tier: number; amount: string } | null>(null);
  const [alert, setAlert] = useState<AlertMessage | null>(null);

  // 05 Spatial Card Expansion state for managing a SEALED box
  const [expandedBoxId, setExpandedBoxId] = useState<string | null>(null);
  const [actionTab, setActionTab] = useState<SealedActionTab>('ACTIVATE');
  const [postUrl, setPostUrl] = useState('');
  const [postSummary, setPostSummary] = useState('');
  const [listPriceBnb, setListPriceBnb] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Compact drawers for secondary actions
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmt, setWithdrawAmt] = useState('0.05');
  const [showSocial, setShowSocial] = useState(false);
  const [squareUrl, setSquareUrl] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { writeContractAsync, isPending } = useWriteContract();

  const loadBoxes = useCallback(async () => {
    if (!profile) return;
    const [boxRes, marketRes] = await Promise.all([
      apiFetch<{ boxes: MyBox[] }>('/boxes/my').catch(() => ({ boxes: [] })),
      apiFetch<{ listings: OpenListing[] }>('/market/listings').catch(() => ({ listings: [] })),
    ]);
    setBoxes(boxRes.boxes);

    const map: Record<string, OpenListing> = {};
    for (const l of marketRes.listings) {
      if (l.sellerId === profile.id) {
        map[l.boxId] = l;
      }
    }
    setMyListingsByBoxId(map);
  }, [profile]);

  useEffect(() => {
    loadBoxes();
  }, [loadBoxes]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') onRefreshProfile();
    };
    document.addEventListener('visibilitychange', refreshVisible);
    return () => document.removeEventListener('visibilitychange', refreshVisible);
  }, [onRefreshProfile]);

  // Escape collapses expanded spatial card
  useEffect(() => {
    if (!expandedBoxId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedBoxId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expandedBoxId]);

  const counts = useMemo(() => {
    return {
      ALL: boxes.length,
      SEALED: boxes.filter((b) => b.status === 'SEALED').length,
      LISTED: boxes.filter((b) => b.status === 'LISTED').length,
      ACTIVE: boxes.filter((b) => b.status === 'ACTIVE').length,
    };
  }, [boxes]);

  const filterTabs: readonly SlidingTabItem<BoxFilterKey>[] = useMemo(
    () => [
      { key: 'ALL', label: '全部', count: counts.ALL },
      { key: 'SEALED', label: '完整', count: counts.SEALED },
      { key: 'LISTED', label: '挂单中', count: counts.LISTED },
      { key: 'ACTIVE', label: '进行中', count: counts.ACTIVE },
    ],
    [counts]
  );

  const visibleBoxes = useMemo(() => {
    if (boxFilter === 'ALL') return boxes;
    return boxes.filter((b) => b.status === boxFilter);
  }, [boxes, boxFilter]);

  if (!profile) {
    return (
      <div className="rounded-2xl border border-pop-border bg-pop-card p-8 text-center space-y-4">
        <img
          src="/assets/fruit-edition/scenes/connect-wallet.png"
          alt="POP 果实"
          className="w-32 mx-auto object-contain"
        />
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white">连接钱包查看资产</h2>
          <p className="text-xs text-gray-400">
            管理 $POP 余额、完整果实与集市挂单
          </p>
        </div>
        <button
          type="button"
          onClick={onLoginWallet}
          className="rounded-xl bg-pop-lime text-black font-bold px-6 py-2.5 text-xs hover:brightness-95 transition"
        >
          连接钱包登录
        </button>
      </div>
    );
  }

  const openManagePanel = (box: MyBox, initialTab: SealedActionTab = 'ACTIVATE') => {
    const tierSpec = SEASON_1_TIERS.find((t) => t.tierId === box.tierId);
    setExpandedBoxId(box.id);
    setActionTab(initialTab);
    setListPriceBnb(tierSpec ? String((Number(tierSpec.priceBnb) * 1.25).toFixed(3)) : '0.05');
    setAlert(null);
  };

  const closeManagePanel = () => {
    setExpandedBoxId(null);
    setPostUrl('');
    setPostSummary('');
  };

  const handleBatchClaim = async () => {
    setAlert(null);
    if (IS_MOCK_MODE) {
      try {
        const res = mockClaimPop();
        setAlert({
          type: 'ok',
          text: `已领取 +${Number(res.claimed).toLocaleString()} $POP（${res.txHash.slice(0, 14)}...）`,
        });
        onRefreshProfile();
      } catch (err) {
        setAlert({ type: 'err', text: err instanceof Error ? err.message : '领取失败' });
      }
      return;
    }

    try {
      const prepared = await apiFetch<{
        amountWei: string;
        deadline: number;
        signature: `0x${string}`;
        verifyingContract: `0x${string}`;
      }>('/wallet/claim-pop/prepare', { method: 'POST', body: '{}' });

      const hash = await writeContractAsync({
        address: prepared.verifyingContract || POP_CLAIM_VAULT_ADDRESS,
        abi: POP_CLAIM_VAULT_ABI,
        functionName: 'claim',
        args: [BigInt(prepared.amountWei), BigInt(prepared.deadline), prepared.signature],
      });

      setAlert({ type: 'ok', text: `领币交易已提交：${hash.slice(0, 14)}...` });
      onRefreshProfile();
    } catch (err) {
      setAlert({ type: 'err', text: err instanceof Error ? err.message : '领币上链失败' });
    }
  };

  const bnbAvailNum = Number(profile.bnbAvailable);
  const withdrawNum = Number(withdrawAmt);
  const withdrawValid =
    Number.isFinite(withdrawNum) &&
    withdrawNum >= BNB_CUSTODY_LIMITS.MIN_WITHDRAW_BNB &&
    withdrawNum <= bnbAvailNum;

  const handleWithdrawBnb = async () => {
    if (!withdrawValid) {
      setAlert({
        type: 'err',
        text: `请输入 ${BNB_CUSTODY_LIMITS.MIN_WITHDRAW_BNB} ~ ${profile.bnbAvailable} 之间的有效 BNB 数量`,
      });
      return;
    }
    setAlert(null);
    try {
      const res = await apiFetch<{ status: string; amountBnb: string }>('/wallet/withdraw-bnb', {
        method: 'POST',
        body: JSON.stringify({ amountBnb: withdrawAmt }),
      });
      setAlert({ type: 'ok', text: `BNB 提现申请已提交（${res.amountBnb} BNB）` });
      setShowWithdraw(false);
      onRefreshProfile();
    } catch (err) {
      setAlert({ type: 'err', text: err instanceof Error ? err.message : '提现失败' });
    }
  };

  const summaryLen = postSummary.trim().length;
  const activateValid = postUrl.trim().length > 0 && summaryLen >= 10;

  const handleActivate = async (boxId: string) => {
    if (!activateValid) {
      setAlert({ type: 'err', text: '请填写有效的 X/币安广场链接及不少于 10 字的正文摘要。' });
      return;
    }
    setAlert(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ instantPopUnlocked: string; priorityPassGrantedForSeason?: number | null }>(`/boxes/${boxId}/activate`, {
        method: 'POST',
        body: JSON.stringify({
          targetUrl: postUrl.trim(),
          contentSnapshot: postSummary.trim(),
          contentTitle: postSummary.trim().slice(0, 80),
        }),
      });
      setAlert({
        type: 'ok',
        text: `首份已到账：+${Number(res.instantPopUnlocked).toLocaleString()} POP。${res.priorityPassGrantedForSeason ? `已获得第 ${res.priorityPassGrantedForSeason} 季优先认购资格。` : ''}`,
      });
      const fruit = boxes.find(item => item.id === boxId);
      if (fruit) setFirstBite({ id: boxId, tier: fruit.tierId, amount: res.instantPopUnlocked });
      closeManagePanel();
      loadBoxes();
      onRefreshProfile();
    } catch (err) {
      setAlert({ type: 'err', text: err instanceof Error ? err.message : '激活失败' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleListBox = async (boxId: string) => {
    setAlert(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ priceBnb: string }>('/market/list', {
        method: 'POST',
        body: JSON.stringify({ boxId, priceBnb: listPriceBnb }),
      });
      setAlert({
        type: 'ok',
        text: `已挂单至果实集市（定价 ${res.priceBnb} BNB，成交扣除 4% 手续费）。`,
      });
      closeManagePanel();
      loadBoxes();
    } catch (err) {
      setAlert({ type: 'err', text: err instanceof Error ? err.message : '挂单失败' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelListing = async (listingId: string) => {
    setAlert(null);
    try {
      await apiFetch('/market/cancel', {
        method: 'POST',
        body: JSON.stringify({ listingId }),
      });
      setAlert({ type: 'ok', text: '挂单已撤销，果实恢复为完整状态。' });
      loadBoxes();
    } catch (err) {
      setAlert({ type: 'err', text: err instanceof Error ? err.message : '撤单失败' });
    }
  };

  const handleVerifySquare = async () => {
    setAlert(null);
    try {
      await apiFetch('/users/verify-square', {
        method: 'POST',
        body: JSON.stringify({ binanceSquareUrl: squareUrl.trim(), squareFollowers: 1000 }),
      });
      setAlert({ type: 'ok', text: '币安广场账号认证成功！' });
      setShowSocial(false);
      onRefreshProfile();
    } catch (err) {
      setAlert({ type: 'err', text: err instanceof Error ? err.message : '币安广场链接无效' });
    }
  };

  const listPriceNum = Number(listPriceBnb);
  const validListPrice = Number.isFinite(listPriceNum) && listPriceNum > 0;
  const estNetBnb = validListPrice ? (listPriceNum * 0.96).toFixed(4) : '0.0000';

  return (
    <div className="space-y-4">
      {firstBite && <div key={firstBite.id} className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-6" onClick={() => setFirstBite(null)}>
        <div role="dialog" aria-label="果实首领成功" className="rounded-3xl bg-pop-card border border-pop-border p-6 text-center" onClick={e => e.stopPropagation()}>
          <div className="mx-auto h-48 w-48"><FruitBite before={fruitImage(firstBite.tier, 0, 1, false)} after={fruitImage(firstBite.tier, 0, 1)} tierId={firstBite.tier} label="果实被吃了第一口" /></div>
          <p className="my-3 font-bold">首份已领取 · +{Number(firstBite.amount).toLocaleString()} POP</p>
          <button autoFocus className="rounded-full bg-pop-lime px-4 py-2 font-bold text-black" onClick={() => setFirstBite(null)}>继续邀请朋友</button>
        </div></div>}
      <InlineAlert alert={alert} onDismiss={() => setAlert(null)} />

      {/* Compact 2-Column Asset Summary (01 Data Awakening) */}
      <AwakenItem index={0}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* $POP Card */}
          <div className="rounded-2xl border border-pop-border bg-pop-card p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-gray-400">
                  {pack.tokenIconSrc && (
                    <img src={pack.tokenIconSrc} alt="$POP" className="w-4 h-4 rounded-full" />
                  )}
                  可领 $POP
                </span>
                <span className="text-[11px] text-gray-500 tabular-nums">
                  累计已领 {Number(profile.popClaimedTotal).toLocaleString()}
                </span>
              </div>
              <div className="mt-1.5 text-2xl font-black text-white">
                <AnimatedNumber value={Number(profile.popAvailable)} decimals={2} />{' '}
                <span className="text-sm font-bold text-pop-lime">$POP</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleBatchClaim}
              disabled={isPending || Number(profile.popAvailable) <= 0}
              className="arcade-btn w-full rounded-xl py-2 text-xs"
            >
              {isPending ? '钱包确认中...' : '一键链上领取 $POP'}
            </button>
          </div>

          {/* BNB Card */}
          <div className="rounded-2xl border border-pop-border bg-pop-card p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-gray-400">
                  <ChainDiamondIcon className="w-3.5 h-3.5 text-gray-400" />
                  站内可用 BNB
                </span>
                <span className="text-[11px] text-gray-500">用于集市 0 Gas 秒买</span>
              </div>
              <div className="mt-1.5 text-2xl font-black text-white">
                <AnimatedNumber value={bnbAvailNum} decimals={4} />{' '}
                <span className="text-sm font-bold text-gray-400">BNB</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowWithdraw((prev) => !prev)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-pop-border bg-pop-elevated py-2 text-xs font-semibold text-gray-200 hover:border-pop-borderHover hover:text-white transition"
            >
              <Send className="w-3.5 h-3.5" />
              {showWithdraw ? '收起提现' : '提现 BNB'}
            </button>
          </div>
        </div>
      </AwakenItem>

      {/* Expandable BNB Withdraw Drawer */}
      <AnimatePresence initial={false}>
        {showWithdraw && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-pop-borderHover bg-pop-card p-3.5 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={withdrawAmt}
                  onChange={(e) => setWithdrawAmt(e.target.value)}
                  placeholder={`最低 ${BNB_CUSTODY_LIMITS.MIN_WITHDRAW_BNB} BNB`}
                  className="flex-1 rounded-xl bg-pop-bg border border-pop-border px-3 py-2 text-xs text-white tabular-nums focus:border-pop-lime focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setWithdrawAmt(profile.bnbAvailable)}
                  className="rounded-xl border border-pop-border bg-pop-elevated px-2.5 py-2 text-[11px] font-semibold text-gray-300 hover:text-white transition"
                >
                  全部
                </button>
                <button
                  type="button"
                  disabled={!withdrawValid}
                  onClick={handleWithdrawBnb}
                  className="shrink-0 rounded-xl bg-pop-lime text-black font-bold px-4 py-2 text-xs hover:brightness-95 transition disabled:opacity-40"
                >
                  确认提现
                </button>
              </div>
              <div className="text-[11px] text-gray-500 tabular-nums">
                最低提现 {BNB_CUSTODY_LIMITS.MIN_WITHDRAW_BNB} BNB · ≤ {BNB_CUSTODY_LIMITS.AUTO_WITHDRAW_MAX_BNB} BNB 自动出款
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* My Boxes Section with 04 Sliding Highlight & 05 Spatial Card Expansion */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">我的果实</h2>
          <SlidingTabs
            layoutId="me-boxes-filter"
            items={filterTabs}
            value={boxFilter}
            onChange={setBoxFilter}
            variant="neutral"
          />
        </div>

        {visibleBoxes.length === 0 ? (
          <EmptyBoxState scene="no-collection"
            title="当前分类暂无果实"
            description="前往「果实首发」认购果实，或在「果实集市」0 Gas 扫货。"
          />
        ) : (
          <div className="space-y-2.5">
            {visibleBoxes.map((b, idx) => {
              const meta = getTierVisualMeta(b.tierId);
              const statusInfo = STATUS_META[b.status] ?? {
                label: b.status,
                className: 'bg-white/5 text-gray-300 border-pop-border',
              };
              const isExpanded = expandedBoxId === b.id;
              const isSiblingDimmed = expandedBoxId !== null && !isExpanded;
              const activeListing = myListingsByBoxId[b.id];
              const activePct = Math.min(
                100,
                Math.round((b.claimedClicks / Math.max(1, b.maxClicks)) * 100)
              );

              return (
                <AwakenItem key={b.id} index={idx}>
                  <motion.div
                    layout
                    animate={{
                      opacity: isSiblingDimmed ? 0.45 : 1,
                      scale: isSiblingDimmed ? 0.985 : 1,
                    }}
                    transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                    className={`rounded-2xl border bg-pop-card p-3.5 space-y-3 transition-colors ${
                      isExpanded ? 'border-pop-lime/50' : 'border-pop-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BoxVisual
                        tierId={b.tierId}
                        size="sm"
                        openedSrc={fruitImage(b.tierId, b.claimedClicks, b.maxClicks)}
                        isOpened={b.status === 'ACTIVE' || b.status === 'COMPLETED'}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-bold shrink-0"
                              style={{ color: meta.color, backgroundColor: `${meta.color}16` }}
                            >
                              {meta.shortLabel}
                            </span>
                            <span className="truncate text-sm font-bold text-white tabular-nums">
                              {meta.name} #{b.seqIndex}
                            </span>
                          </div>
                          <span
                            className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusInfo.className}`}
                          >
                            {statusInfo.label}
                          </span>
                        </div>

                        <div className="text-[11px] text-gray-400 mt-1 tabular-nums">
                          果实 {Number(b.totalPopAmount).toLocaleString()} $POP · 满额 {b.maxClicks} 点击
                        </div>
                      </div>
                    </div>

                    {/* SEALED Box Actions (Collapsed State) */}
                    {b.status === 'SEALED' && !isExpanded && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openManagePanel(b, 'ACTIVATE')}
                          className="arcade-btn inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> 分享并领取首份
                        </button>
                        <button
                          type="button"
                          onClick={() => openManagePanel(b, 'LIST')}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-pop-border bg-pop-elevated text-white font-semibold py-2 text-xs hover:border-pop-borderHover transition"
                        >
                          <Tag className="w-3.5 h-3.5 text-gray-400" /> 挂单出售
                        </button>
                      </div>
                    )}

                    {/* 05 Spatial Card Expansion Panel (Activate OR List on Market) */}
                    <AnimatePresence initial={false}>
                      {b.status === 'SEALED' && isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden border-t border-pop-border pt-3 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <SlidingTabs
                              layoutId={`sealed-action-${b.id}`}
                              items={SEALED_ACTION_TABS}
                              value={actionTab}
                              onChange={setActionTab}
                              variant="neutral"
                            />
                            <button
                              type="button"
                              onClick={closeManagePanel}
                              aria-label="收起面板"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-pop-elevated hover:text-white transition"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          {/* 4-column responsive spec strip inside expanded panel */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                            <div className="rounded-xl bg-pop-bg border border-pop-border px-2.5 py-2">
                              <div className="text-gray-500">果实总额</div>
                              <div className="font-bold text-white tabular-nums mt-0.5">
                                {Number(b.totalPopAmount).toLocaleString()}
                              </div>
                            </div>
                            <div className="rounded-xl bg-pop-bg border border-pop-border px-2.5 py-2">
                              <div className="text-gray-500">激活立领 20%</div>
                              <div className="font-bold text-pop-lime tabular-nums mt-0.5">
                                +{Math.round(Number(b.totalPopAmount) * 0.2).toLocaleString()}
                              </div>
                            </div>
                            <div className="rounded-xl bg-pop-bg border border-pop-border px-2.5 py-2">
                              <div className="text-gray-500">满额点击</div>
                              <div className="font-bold text-white tabular-nums mt-0.5">
                                {b.maxClicks} 次
                              </div>
                            </div>
                            <div className="rounded-xl bg-pop-bg border border-pop-border px-2.5 py-2">
                              <div className="text-gray-500">下期权益</div>
                              <div className="font-bold text-gray-200 mt-0.5">优先购资格</div>
                            </div>
                          </div>

                          {actionTab === 'ACTIVATE' ? (
                            <div className="space-y-2">
                              <input
                                type="url"
                                value={postUrl}
                                onChange={(e) => setPostUrl(e.target.value)}
                                placeholder="粘贴 X 推文或币安广场帖子链接"
                                className="w-full rounded-xl bg-pop-bg border border-pop-border px-3 py-2 text-xs text-white focus:border-pop-lime focus:outline-none"
                              />
                              <div className="space-y-1">
                                <textarea
                                  value={postSummary}
                                  onChange={(e) => setPostSummary(e.target.value)}
                                  placeholder="粘贴帖子核心正文（至少 10 字，自动生成 5 道 3 选 1 理解题）"
                                  rows={3}
                                  className="w-full rounded-xl bg-pop-bg border border-pop-border px-3 py-2 text-xs text-white focus:border-pop-lime focus:outline-none"
                                />
                                <div className="flex justify-between text-[10px] text-gray-500 px-0.5 tabular-nums">
                                  <span>用于生成防刷理解题</span>
                                  <span className={summaryLen >= 10 ? 'text-pop-lime' : ''}>
                                    {summaryLen}/10 字
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={submitting || !activateValid}
                                onClick={() => handleActivate(b.id)}
                                className="w-full rounded-xl bg-pop-lime text-black font-bold py-2.5 text-xs hover:brightness-95 transition disabled:opacity-40"
                              >
                                {submitting ? '正在生成题目...' : '确认分享并领取首份（立领 20%）'}
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={listPriceBnb}
                                  onChange={(e) => setListPriceBnb(e.target.value)}
                                  placeholder="输入出售价格（BNB）"
                                  className="flex-1 rounded-xl bg-pop-bg border border-pop-border px-3 py-2 text-xs text-white tabular-nums focus:border-pop-lime focus:outline-none"
                                />
                                <span className="text-xs font-semibold text-gray-400 pr-1">BNB</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-gray-400 tabular-nums px-0.5">
                                <span>卖方手续费 4%</span>
                                <span>
                                  预计实收 <strong className="text-pop-lime">{estNetBnb} BNB</strong>
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={submitting || !validListPrice}
                                onClick={() => handleListBox(b.id)}
                                className="w-full rounded-xl bg-pop-lime text-black font-bold py-2.5 text-xs hover:brightness-95 transition disabled:opacity-40"
                              >
                                {submitting ? '挂单中...' : `确认挂单 · ${listPriceBnb || '0'} BNB`}
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* LISTED Box Status Bar */}
                    {b.status === 'LISTED' && (
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-pop-border text-xs">
                        <span className="text-gray-400 tabular-nums">
                          集市在售价：
                          <strong className="text-white ml-1">
                            {activeListing ? `${activeListing.priceBnb} BNB` : '挂单中'}
                          </strong>
                        </span>
                        {activeListing && (
                          <button
                            type="button"
                            onClick={() => handleCancelListing(activeListing.id)}
                            className="rounded-lg border border-pop-border bg-pop-elevated px-3 py-1 text-xs font-semibold text-gray-200 hover:border-pop-borderHover hover:text-white transition"
                          >
                            撤销挂单
                          </button>
                        )}
                      </div>
                    )}

                    {/* ACTIVE Box Progress & TG Command */}
                    {b.status === 'ACTIVE' && (
                      <div className="space-y-2 pt-2 border-t border-pop-border">
                        <div className="flex items-center justify-between text-[11px] text-gray-400 tabular-nums">
                          <span>
                            {IS_MOCK_MODE && <a className="mr-2 text-pop-lime underline" href={`/explore?boxId=${encodeURIComponent(b.id)}`}>朋友视角</a>}
                            已领 {b.claimedClicks}/{b.maxClicks} 份 · 持有者累计解锁 {(Number(b.totalPopAmount) * (0.2 + 0.5 * b.claimedClicks / Math.max(1, b.maxClicks))).toLocaleString()} POP
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyText(`${window.location.origin}/explore?boxId=${encodeURIComponent(b.id)}`);
                              if (ok) {
                                setCopiedId(b.id);
                                window.setTimeout(() => setCopiedId(null), 1800);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-pop-lime font-semibold hover:opacity-80"
                          >
                            {copiedId === b.id ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            {copiedId === b.id ? '已复制邀请' : '复制阅读邀请'}
                          </button>
                        </div>
                        <button className="text-xs text-gray-400" onClick={() => copyText(`/pop ${b.id}`)}>复制 Telegram 群指令</button>
                        <AnimatedProgressBar percent={activePct} color={meta.color} heightClassName="h-1" />
                      </div>
                    )}
                  </motion.div>
                </AwakenItem>
              );
            })}
          </div>
        )}
      </section>

      {/* Compact Collapsible Account & Social Verification Row */}
      <div className="rounded-2xl border border-pop-border bg-pop-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSocial((prev) => !prev)}
          className="w-full flex items-center justify-between px-4 py-3.5 text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-semibold text-white">账号与社交认证</span>
            <span className="truncate font-mono text-[11px] text-gray-500">
              {profile.walletAddress
                ? `${profile.walletAddress.slice(0, 6)}...${profile.walletAddress.slice(-4)}`
                : '0U TMA 账户'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                profile.squareVerified
                  ? 'bg-pop-lime/15 text-pop-lime'
                  : 'bg-pop-elevated text-gray-400'
              }`}
            >
              <SquareLogoIcon className="w-3 h-3" />
              {profile.squareVerified ? '广场已认证' : '未认证'}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-gray-500 transition-transform ${
                showSocial ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        <AnimatePresence initial={false}>
          {showSocial && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-pop-border"
            >
              <div className="p-4 space-y-2.5">
                <div className="text-[11px] text-gray-400">
                  绑定币安广场个人主页，提升创作者推文曝光权重。
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={squareUrl}
                    onChange={(e) => setSquareUrl(e.target.value)}
                    placeholder="输入币安广场个人主页链接"
                    className="flex-1 rounded-xl bg-pop-bg border border-pop-border px-3 py-2 text-xs text-white focus:border-pop-lime focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!squareUrl.trim()}
                    onClick={handleVerifySquare}
                    className="shrink-0 rounded-xl bg-pop-lime text-black font-bold px-3.5 py-2 text-xs hover:brightness-95 transition disabled:opacity-40"
                  >
                    认证
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
