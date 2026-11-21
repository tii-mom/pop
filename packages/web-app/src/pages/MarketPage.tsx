import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownToLine, Copy, Check, ArrowUpDown } from 'lucide-react';
import { SEASON_1_TIERS } from '@pop-box/shared';
import { apiFetch } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { BoxVisual, getTierVisualMeta } from '../components/BoxVisual';
import { ChainDiamondIcon } from '../components/BrandIcons';
import { EmptyBoxState } from '../components/EmptyBoxState';
import { AnimatedNumber, AwakenItem } from '../components/DataAwakening';
import { SlidingTabs, type SlidingTabItem } from '../components/SlidingTabs';
import { InlineAlert, type AlertMessage } from '../components/InlineAlert';

interface ListingItem {
  id: string;
  boxId: string;
  seasonId: number;
  tierId: number;
  seqIndex: number;
  priceBnb: string;
  feeBnb: string;
  sellerId: string;
}

interface MarketResp {
  feeBps: number;
  floors: Record<number, string | null>;
  listings: ListingItem[];
}

type SortKey = 'PRICE_ASC' | 'PRICE_DESC';

const SORT_TABS: readonly SlidingTabItem<SortKey>[] = [
  { key: 'PRICE_ASC', label: '低价优先' },
  { key: 'PRICE_DESC', label: '高价优先' },
];

export function MarketPage({
  isAuthenticated,
  currentUserId,
  onRequireLogin,
  onPurchased,
}: {
  isAuthenticated: boolean;
  currentUserId: string | null;
  onRequireLogin: () => void;
  onPurchased: () => void;
}) {
  const [data, setData] = useState<MarketResp | null>(null);
  const [floors, setFloors] = useState<Record<number, string | null>>({ 0: null, 1: null, 2: null });
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('PRICE_ASC');
  const [depositAddr, setDepositAddr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reqIdRef = useRef(0);

  const loadListings = useCallback(async () => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    const qs = tierFilter !== null ? `?tierId=${tierFilter}` : '';
    const res = await apiFetch<MarketResp>(`/market/listings${qs}`).catch(() => null);
    if (myReqId !== reqIdRef.current) return;

    if (res) {
      setData(res);
      // Preserve other tiers' floors when filtering by a single tier on live backend
      setFloors((prev) =>
        tierFilter === null
          ? res.floors
          : { ...prev, [tierFilter]: res.floors[tierFilter] ?? null }
      );
    }
    setLoading(false);
  }, [tierFilter]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const sortedListings = useMemo(() => {
    const list = [...(data?.listings ?? [])];
    list.sort((a, b) => {
      const diff = Number(a.priceBnb) - Number(b.priceBnb);
      return sortBy === 'PRICE_ASC' ? diff : -diff;
    });
    return list;
  }, [data, sortBy]);

  const handleBuy = async (listingId: string) => {
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    setAlert(null);
    setBusyId(listingId);
    try {
      const res = await apiFetch<{ boxId: string; priceBnb: string }>('/market/buy', {
        method: 'POST',
        body: JSON.stringify({ listingId }),
      });
      setAlert({
        type: 'ok',
        text: `成交成功！果实 #${res.boxId.slice(-6)} 已入库（支付 ${res.priceBnb} BNB）。`,
      });
      loadListings();
      onPurchased();
    } catch (err) {
      setAlert({
        type: 'err',
        text: err instanceof Error ? err.message : '购买失败，请确认站内 BNB 余额充足',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (listingId: string) => {
    setAlert(null);
    setBusyId(listingId);
    try {
      await apiFetch('/market/cancel', {
        method: 'POST',
        body: JSON.stringify({ listingId }),
      });
      setAlert({ type: 'ok', text: '挂单已撤销，果实已退回「我的资产」。' });
      loadListings();
      onPurchased();
    } catch (err) {
      setAlert({
        type: 'err',
        text: err instanceof Error ? err.message : '撤单失败',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleShowDeposit = async () => {
    if (depositAddr) {
      setDepositAddr(null);
      return;
    }
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    try {
      const res = await apiFetch<{ depositAddress: string }>('/wallet/deposit-address');
      setDepositAddr(res.depositAddress);
    } catch (err) {
      setAlert({
        type: 'err',
        text: err instanceof Error ? err.message : '请先绑定 BSC 钱包后获取充值地址',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">果实集市</h1>
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            完整果实 0 Gas 交易 · 卖方手续费 {(data?.feeBps ?? 400) / 100}%
          </p>
        </div>

        <button
          type="button"
          onClick={handleShowDeposit}
          className="inline-flex items-center gap-1.5 rounded-xl border border-pop-border bg-pop-card px-3 py-2 text-xs font-semibold text-gray-200 hover:border-pop-borderHover hover:text-white transition"
        >
          <ArrowDownToLine className="w-3.5 h-3.5 text-pop-lime" />
          {depositAddr ? '收起充值' : '充值 BNB'}
        </button>
      </div>

      {depositAddr && (
        <div className="rounded-2xl border border-pop-borderHover bg-pop-card p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between text-gray-300 font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <ChainDiamondIcon className="w-3.5 h-3.5 text-pop-lime" />
              BSC 站内托管充值地址
            </span>
            <span className="text-[11px] font-normal text-gray-500">请使用已绑定钱包直转</span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-pop-bg border border-pop-border px-3 py-2 font-mono text-[11px] text-white break-all">
            <span>{depositAddr}</span>
            <button
              type="button"
              onClick={async () => {
                const ok = await copyText(depositAddr);
                if (ok) {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                }
              }}
              className="shrink-0 text-pop-lime hover:opacity-80"
              aria-label="复制充值地址"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* 3-Tier Floor Strip (01 Data Awakening + 04 Sliding Highlight Selection) */}
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((t) => {
          const meta = getTierVisualMeta(t);
          const tierSpec = SEASON_1_TIERS.find((s) => s.tierId === t);
          const floorStr = floors[t] ?? null;
          const floorNum = floorStr ? Number(floorStr) : null;
          const mintNum = tierSpec ? Number(tierSpec.priceBnb) : null;
          const deltaPct =
            floorNum !== null && mintNum && mintNum > 0
              ? Math.round(((floorNum - mintNum) / mintNum) * 100)
              : null;
          const active = tierFilter === t;

          return (
            <button
              key={t}
              type="button"
              onClick={() => setTierFilter(active ? null : t)}
              className={`relative rounded-xl border p-3 text-left transition-colors ${
                active
                  ? 'border-pop-lime/70 bg-pop-elevated'
                  : 'border-pop-border bg-pop-card hover:border-pop-borderHover'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className="text-[10px] font-bold tracking-wider"
                  style={{ color: meta.color }}
                >
                  {meta.shortLabel}
                </span>
                {deltaPct !== null && (
                  <span
                    className={`text-[10px] font-semibold tabular-nums ${
                      deltaPct > 0
                        ? 'text-pop-lime'
                        : deltaPct < 0
                          ? 'text-amber-400'
                          : 'text-gray-500'
                    }`}
                  >
                    {deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}
                  </span>
                )}
              </div>

              <div className="text-sm font-black text-white mt-1.5 tabular-nums">
                {floorNum !== null ? (
                  <>
                    <AnimatedNumber
                      value={floorNum}
                      decimals={Math.min(4, floorStr?.split('.')[1]?.length ?? 2)}
                    />{' '}
                    <span className="text-[10px] font-medium text-gray-400">BNB</span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-gray-500">暂无挂单</span>
                )}
              </div>

              {active && (
                <motion.span
                  layoutId="market-tier-underline"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-pop-lime"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Sort & Count Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 tabular-nums">
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
          <span>在售 {sortedListings.length} 个</span>
          {tierFilter !== null && (
            <button
              type="button"
              onClick={() => setTierFilter(null)}
              className="ml-1 text-[11px] text-pop-lime hover:underline"
            >
              显示全部
            </button>
          )}
        </div>

        <SlidingTabs
          layoutId="market-sort-pill"
          items={SORT_TABS}
          value={sortBy}
          onChange={setSortBy}
          variant="neutral"
        />
      </div>

      <InlineAlert alert={alert} onDismiss={() => setAlert(null)} />

      {/* High-Density Listing Rows */}
      {loading && !data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-pop-border bg-pop-card p-3.5 flex items-center justify-between animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-pop-elevated" />
                <div className="space-y-2">
                  <div className="h-3.5 w-32 rounded bg-pop-elevated" />
                  <div className="h-3 w-20 rounded bg-pop-elevated" />
                </div>
              </div>
              <div className="h-8 w-20 rounded-xl bg-pop-elevated" />
            </div>
          ))}
        </div>
      ) : sortedListings.length === 0 ? (
        <EmptyBoxState scene="no-listings"
          title="暂无在售完整果实"
          description="可切换其他档位查看底价，或在「我的资产」中挂出完整果实。"
        />
      ) : (
        <div className="space-y-2">
          {sortedListings.map((item, idx) => {
            const meta = getTierVisualMeta(item.tierId);
            const isOwn = Boolean(currentUserId && item.sellerId === currentUserId);
            const isBusy = busyId === item.id;

            return (
              <AwakenItem key={item.id} index={idx}>
                <div className="rounded-2xl border border-pop-border bg-pop-card p-3.5 flex items-center justify-between gap-3 hover:border-pop-borderHover transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <BoxVisual tierId={item.tierId} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ color: meta.color, backgroundColor: `${meta.color}16` }}
                        >
                          {meta.shortLabel}
                        </span>
                        <span className="truncate text-sm font-bold text-white tabular-nums">
                          {meta.name} #{item.seqIndex}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-1 tabular-nums">
                        <span>S{item.seasonId}</span>
                        <span className="text-gray-600">·</span>
                        <span>完整</span>
                        {isOwn && (
                          <>
                            <span className="text-gray-600">·</span>
                            <span className="text-gray-300">我的挂单</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right tabular-nums">
                      <div className="text-sm font-black text-white">{item.priceBnb} BNB</div>
                      <div className="text-[10px] text-gray-500">0 Gas</div>
                    </div>

                    {isOwn ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleCancel(item.id)}
                        className="rounded-xl border border-pop-borderHover bg-pop-elevated px-3.5 py-2 text-xs font-semibold text-gray-200 hover:text-white transition disabled:opacity-50"
                      >
                        {isBusy ? '撤销中...' : '撤单'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleBuy(item.id)}
                        className="arcade-btn rounded-xl px-3.5 py-2 text-xs"
                      >
                        {isBusy ? '成交中...' : '秒买'}
                      </button>
                    )}
                  </div>
                </div>
              </AwakenItem>
            );
          })}
        </div>
      )}
    </div>
  );
}
