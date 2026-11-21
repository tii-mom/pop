import { useLocation } from 'react-router-dom';
import { fruitImage } from '../lib/artPack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, RefreshCw, ArrowUpRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { BoxVisual, getTierVisualMeta } from '../components/BoxVisual';
import { PlatformBadge } from '../components/BrandIcons';
import { EmptyBoxState } from '../components/EmptyBoxState';
import { QuizModal } from '../components/QuizModal';
import { SlidingTabs, type SlidingTabItem } from '../components/SlidingTabs';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  AwakenItem,
} from '../components/DataAwakening';
import { detectStartBoxParam } from '../hooks/usePopAuth';

interface FeedBox {
  id: string;
  seasonId: number;
  tierId: number;
  platform: 'X' | 'BINANCE_SQUARE' | null;
  targetUrl: string | null;
  externalPostId: string | null;
  contentTitle: string | null;
  maxClicks: number;
  claimedClicks: number;
  remainingClicks: number;
  readerRewardPop: string;
  remainingReaderPop?: string;
  sharer?: string | null;
  expiresAt: string | null;
}

type FilterKey = 'ALL' | 'WHALE' | 'X' | 'BINANCE_SQUARE';

const FILTER_TABS: readonly SlidingTabItem<FilterKey>[] = [
  { key: 'ALL', label: '全部' },
  { key: 'WHALE', label: '橙子' },
  { key: 'X', label: 'X' },
  { key: 'BINANCE_SQUARE', label: '币安广场' },
];

function formatRemainingTime(expiresAt: string | null, nowMs: number): string {
  if (!expiresAt) return '72h 有效';
  const diffMs = new Date(expiresAt).getTime() - nowMs;
  if (Number.isNaN(diffMs) || diffMs <= 0) return '即将结束';
  const totalMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `剩 ${days}天${remHours}h`;
  }
  return `剩 ${hours}h ${mins}m`;
}

export function ExplorePage({
  isAuthenticated,
  isTma,
  onRequireLogin,
  onRewardClaimed,
}: {
  isAuthenticated: boolean;
  isTma: boolean;
  onRequireLogin: () => void;
  onRewardClaimed: () => void;
}) {
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [items, setItems] = useState<FeedBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBox, setActiveBox] = useState<FeedBox | null>(null);
  const [inviteMessage, setInviteMessage] = useState('');
  const [tgGroupId, setTgGroupId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const reqIdRef = useRef(0);
  const { search } = useLocation();
  const [invitation, setInvitation] = useState<FeedBox | null>(null);
  const [inviteRetry, setInviteRetry] = useState(0);
  const [inviteFailed, setInviteFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { boxId, tgGroupId: groupId } = detectStartBoxParam();
    setTgGroupId(groupId);
    setInvitation(null);
    setInviteMessage('');
    setInviteFailed(false);
    if (!boxId) return;
    apiFetch<{ items: FeedBox[] }>(`/boxes/feed?id=${encodeURIComponent(boxId)}`)
      .then(({ items }) => {
        if (cancelled) return;
        const fruit = items.find(item => item.id === boxId && item.remainingClicks > 0);
        if (!fruit) setInviteMessage('这颗果实已经结束领取。');
        else if (isAuthenticated) setActiveBox(fruit);
        else setInvitation(fruit);
      })
      .catch(() => {
        if (!cancelled) {
          setInviteFailed(true);
          setInviteMessage('邀请加载失败，请重试。');
        }
      });
    return () => { cancelled = true; };
  }, [search, isAuthenticated, inviteRetry]);

  // Live 30s tick so remaining countdown stays accurate
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadFeed = useCallback(async () => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter === 'WHALE') qs.set('tierId', '2');
      if (filter === 'X') qs.set('platform', 'X');
      if (filter === 'BINANCE_SQUARE') qs.set('platform', 'BINANCE_SQUARE');
      const res = await apiFetch<{ items: FeedBox[] }>(`/boxes/feed?${qs.toString()}`);

      if (myReqId !== reqIdRef.current) return;
      setItems(res.items);

    } catch {
      if (myReqId === reqIdRef.current) {
        setItems([]);
      }
    } finally {
      if (myReqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, [filter]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const stats = useMemo(() => {
    const totalRemaining = items.reduce((acc, b) => acc + b.remainingClicks, 0);
    const maxReward = items.reduce((acc, b) => Math.max(acc, Number(b.readerRewardPop) || 0), 0);
    return { count: items.length, totalRemaining, maxReward };
  }, [items]);

  const handleOpenBox = (box: FeedBox) => {
    if (box.remainingClicks <= 0) return;
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    setActiveBox(box);
  };

  return (
    <div className="space-y-4">
      {invitation && <section className="rounded-2xl border border-pop-lime/50 bg-pop-card p-4 space-y-3">
        <p className="text-xs text-pop-lime">{invitation.sharer ? `@${invitation.sharer} 邀请你共读` : '好友邀请你共读'}</p>
        <h2 className="text-lg font-bold">{invitation.contentTitle || '好友分享的内容'}</h2>
        <div className="flex items-center gap-4 text-sm">
          {invitation.targetUrl && <a href={invitation.targetUrl} target="_blank" rel="noreferrer" className="underline">阅读原帖</a>}
          <button type="button" onClick={onRequireLogin} className="rounded-full bg-pop-lime px-4 py-2 font-bold text-black">连接钱包参与</button>
        </div>
      </section>}
      {inviteFailed && <button onClick={() => setInviteRetry(n => n + 1)} className="text-sm underline">重试邀请</button>}
      {inviteMessage && <p role="status" className="text-sm text-pop-lime">{inviteMessage}</p>}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">发现果实</h1>
          <p className="text-xs text-gray-400 mt-0.5">读热帖答 1 题，即时领 $POP</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-3 rounded-xl border border-pop-border bg-pop-card px-3 py-1.5 text-xs">
            <span className="text-gray-400">
              活跃 <strong className="text-white"><AnimatedNumber value={stats.count} /></strong>
            </span>
            <span className="h-3 w-px bg-pop-border" />
            <span className="text-gray-400">
              最高单题{' '}
              <strong className="text-pop-lime">
                +<AnimatedNumber value={stats.maxReward} /> $POP
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={loadFeed}
            className="rounded-xl border border-pop-border bg-pop-card p-2 text-gray-400 hover:border-pop-borderHover hover:text-white transition"
            aria-label="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile Compact Live Metrics Strip (01 Data Awakening) */}
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        <div className="rounded-xl border border-pop-border bg-pop-card px-3 py-2">
          <div className="text-[11px] text-gray-400">活跃果实</div>
          <div className="text-sm font-bold text-white mt-0.5">
            <AnimatedNumber value={stats.count} />
          </div>
        </div>
        <div className="rounded-xl border border-pop-border bg-pop-card px-3 py-2">
          <div className="text-[11px] text-gray-400">剩余名额</div>
          <div className="text-sm font-bold text-white mt-0.5">
            <AnimatedNumber value={stats.totalRemaining} />
          </div>
        </div>
        <div className="rounded-xl border border-pop-border bg-pop-card px-3 py-2">
          <div className="text-[11px] text-gray-400">最高奖励</div>
          <div className="text-sm font-bold text-pop-lime mt-0.5">
            +<AnimatedNumber value={stats.maxReward} />
          </div>
        </div>
      </div>

      {/* 04 Sliding Highlight Filter Bar */}
      <SlidingTabs
        layoutId="explore-filter-pill"
        items={FILTER_TABS}
        value={filter}
        onChange={setFilter}
      />

      {/* High-Density Feed List */}
      {loading && items.length === 0 ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-pop-border bg-pop-card p-3.5 flex gap-3.5 animate-pulse"
            >
              <div className="w-16 h-16 rounded-xl bg-pop-elevated shrink-0" />
              <div className="flex-1 space-y-2.5 py-0.5">
                <div className="h-3.5 w-24 rounded bg-pop-elevated" />
                <div className="h-4 w-5/6 rounded bg-pop-elevated" />
                <div className="h-2 w-full rounded bg-pop-elevated" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyBoxState scene="no-active"
          title="当前暂无可领取的果实"
          description="可切换其他平台筛选，或前往首发页认购果实并分享内容。"
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((box, index) => {
            const meta = getTierVisualMeta(box.tierId);
            const progressPct = Math.min(
              100,
              Math.round((box.claimedClicks / Math.max(1, box.maxClicks)) * 100)
            );
            const exhausted = box.remainingClicks <= 0;
            const isDimmed = activeBox !== null && activeBox.id !== box.id;

            return (
              <AwakenItem key={box.id} index={index}>
                <motion.div
                  layoutId={`explore-box-${box.id}`}
                  animate={{
                    opacity: isDimmed ? 0.45 : exhausted ? 0.6 : 1,
                    scale: isDimmed ? 0.985 : 1,
                  }}
                  transition={{ duration: 0.22 }}
                  onClick={() => handleOpenBox(box)}
                  role={exhausted ? undefined : 'button'}
                  tabIndex={exhausted ? undefined : 0}
                  onKeyDown={(e) => {
                    if (!exhausted && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleOpenBox(box);
                    }
                  }}
                  className={`group rounded-2xl border border-pop-border bg-pop-card p-3.5 transition-colors ${
                    exhausted
                      ? 'cursor-default'
                      : 'cursor-pointer hover:border-pop-borderHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pop-lime/60'
                  }`}
                >
                  <div className="flex gap-3.5 items-start">
                    <BoxVisual tierId={box.tierId} size="md" isOpened openedSrc={fruitImage(box.tierId, box.claimedClicks, box.maxClicks)} />

                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Top Meta Row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span
                            className="rounded px-1.5 py-0.5 font-bold tracking-wider"
                            style={{
                              color: meta.color,
                              backgroundColor: `${meta.color}16`,
                            }}
                          >
                            {meta.shortLabel}
                          </span>
                          <PlatformBadge platform={box.platform} />
                          <span className="inline-flex items-center gap-1 text-gray-500 tabular-nums">
                            <Clock className="w-3 h-3" />
                            {formatRemainingTime(box.expiresAt, nowMs)}
                          </span>
                        </div>

                        <span className="shrink-0 text-sm font-black text-pop-lime tabular-nums">
                          +{Number(box.readerRewardPop).toLocaleString()} $POP
                        </span>
                      </div>

                      {/* Title */}
                      <div className="text-sm font-semibold text-white line-clamp-2 leading-snug">
                        {box.contentTitle || '精选加密深度帖子'}
                      </div>

                      {/* Bottom Progress + Compact Action */}
                      <div className="flex items-center gap-3 pt-0.5">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-gray-400 tabular-nums">
                            <span>
                              剩余 {box.remainingClicks} 份{box.remainingReaderPop && ` · 读者可领 ${box.remainingReaderPop} POP`}
                            </span>
                            <span>{progressPct}%</span>
                          </div>
                          <AnimatedProgressBar
                            percent={progressPct}
                            color={meta.color}
                            delay={index * 0.05}
                          />
                        </div>

                        <button
                          type="button"
                          disabled={exhausted}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenBox(box);
                          }}
                          className="arcade-btn shrink-0 inline-flex items-center gap-1 rounded-xl px-3.5 py-2 text-xs"
                        >
                          {exhausted ? (
                            '已领完'
                          ) : (
                            <>
                              POP <ArrowUpRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AwakenItem>
            );
          })}
        </div>
      )}

      {/* 05 Spatial Card Expansion Modal */}
      <AnimatePresence>
        {activeBox && (
          <QuizModal
            key={activeBox.id}
            box={activeBox}
            layoutId={`explore-box-${activeBox.id}`}
            source={isTma ? 'TMA' : 'WEB'}
            tgGroupId={tgGroupId}
            onClose={() => setActiveBox(null)}
            onSuccess={() => {
              loadFeed();
              onRewardClaimed();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
