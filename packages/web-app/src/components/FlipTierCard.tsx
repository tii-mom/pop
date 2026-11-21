import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Lock, RotateCw, ArrowLeft } from 'lucide-react';
import type { TierSpec } from '@pop-box/shared';
import { BoxVisual, getTierVisualMeta } from './BoxVisual';

interface FlipTierCardProps {
  tier: TierSpec;
  cap: number;
  bought?: number;
  showBought?: boolean;
  soldOut: boolean;
  locked: boolean;
  remainingForWhale: number;
  isPending: boolean;
  onMint: (tierId: number, priceBnb: string) => void;
}

const REFERRAL_FORMULA: Record<number, string> = {
  0: '基础 2 颗，每邀 1 位首购好友 +2 颗（封顶 20）',
  1: '基础 1 颗，每邀 2 位首购好友 +1 颗（封顶 5）',
  2: '邀请满 5 位首购好友即时解锁 1 颗资格',
};

/**
 * 03 3D Card Hover & Flip — Signature Design #2 (Emotional Showcase Page only).
 * Hover produces subtle pointer-tracked 3D tilt on fine-pointer desktops; click flips 180deg along Y-axis
 * to inspect per-box reward breakdown & referral formula without cluttering the front face.
 */
export function FlipTierCard({
  tier,
  cap,
  bought = 0,
  showBought = false,
  soldOut,
  locked,
  remainingForWhale,
  isPending,
  onMint,
}: FlipTierCardProps) {
  const meta = getTierVisualMeta(tier.tierId);
  const [flipped, setFlipped] = useState(false);
  const [isFinePointer, setIsFinePointer] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: fine)');
    setIsFinePointer(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsFinePointer(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 260, damping: 24 });
  const smoothY = useSpring(mouseY, { stiffness: 260, damping: 24 });

  const tiltRotateX = useTransform(smoothY, [-0.5, 0.5], [5.5, -5.5]);
  const tiltRotateY = useTransform(smoothX, [-0.5, 0.5], [-5.5, 5.5]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isFinePointer || flipped) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const toggleFlip = () => {
    mouseX.set(0);
    mouseY.set(0);
    setFlipped((prev) => !prev);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="perspective-1100"
    >
      <motion.div
        style={
          isFinePointer && !flipped
            ? { rotateX: tiltRotateX, rotateY: tiltRotateY }
            : { rotateX: 0, rotateY: 0 }
        }
        whileHover={isFinePointer && !flipped ? { y: -3 } : undefined}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        className="preserve-3d relative"
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24, mass: 0.9 }}
          className="preserve-3d relative grid"
        >
          {/* FRONT FACE */}
          <div
            aria-hidden={flipped}
            className={`backface-hidden col-start-1 row-start-1 rounded-2xl border bg-pop-card p-4 flex flex-col justify-between gap-4 transition-colors ${
              locked ? 'border-pop-border' : 'border-pop-border hover:border-pop-borderHover'
            }`}
            style={{
              boxShadow: '0 14px 36px -18px rgba(0, 0, 0, 0.75)',
              pointerEvents: flipped ? 'none' : 'auto',
            }}
          >
            <div className="flex items-start gap-4">
              <button
                type="button"
                tabIndex={flipped ? -1 : 0}
                onClick={toggleFlip}
                title="翻转查看果实规则"
                className="group relative shrink-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pop-lime/70"
              >
                <BoxVisual tierId={tier.tierId} size="lg" animateFloat={!locked} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                        style={{
                          color: meta.color,
                          backgroundColor: `${meta.color}16`,
                          border: `1px solid ${meta.color}40`,
                        }}
                      >
                        {meta.shortLabel}
                      </span>
                      <h2 className="text-base font-bold text-white">{meta.name}</h2>
                    </div>

                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-2xl font-black tracking-tight text-white tabular-nums">
                        {tier.priceBnb}
                      </span>
                      <span className="text-xs font-semibold text-gray-400">BNB</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    tabIndex={flipped ? -1 : 0}
                    onClick={toggleFlip}
                    className="inline-flex items-center gap-1 rounded-lg border border-pop-border bg-pop-elevated px-2 py-1 text-[11px] font-medium text-gray-300 hover:border-pop-borderHover hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pop-lime/70"
                  >
                    <RotateCw className="w-3 h-3" />
                    详情
                  </button>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 tabular-nums">
                  <span>限量 {tier.maxSupply.toLocaleString()}</span>
                  <span className="text-gray-600">·</span>
                  <span>
                    {tier.minPop.toLocaleString()}–{tier.maxPop.toLocaleString()} $POP
                  </span>
                  <span className="text-gray-600">·</span>
                  <span>{tier.maxClicks} 点击</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-pop-border/80">
              <div className="text-xs text-gray-400 tabular-nums">
                {locked ? (
                  <span className="inline-flex items-center gap-1 text-gray-300">
                    <Lock className="w-3.5 h-3.5 text-[#9D4EDD]" />
                    还需邀请 {remainingForWhale} 人解锁
                  </span>
                ) : (
                  <span>
                    当前额度 <strong className="text-white">{cap}</strong> 颗
                    {showBought ? `（已购 ${bought}）` : ''}
                  </span>
                )}
              </div>

              <button
                type="button"
                tabIndex={flipped ? -1 : 0}
                onClick={() => onMint(tier.tierId, tier.priceBnb)}
                disabled={isPending || locked || soldOut || (showBought && bought >= cap)}
                className="arcade-btn shrink-0 rounded-xl px-4 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pop-lime/70"
              >
                {soldOut ? '已售罄' : locked
                  ? '待解锁' : showBought && bought >= cap ? '已达购买额度'
                  : isPending
                    ? '钱包确认中...'
                    : `认购 · ${tier.priceBnb} BNB`}
              </button>
            </div>
          </div>

          {/* BACK FACE */}
          <div
            aria-hidden={!flipped}
            className="backface-hidden col-start-1 row-start-1 rounded-2xl border border-pop-borderHover bg-[#131724] p-4 flex flex-col justify-between gap-3"
            style={{
              transform: 'rotateY(180deg)',
              boxShadow: '0 14px 36px -18px rgba(0, 0, 0, 0.75)',
              pointerEvents: flipped ? 'auto' : 'none',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="text-sm font-bold text-white">{meta.name} · 激励拆解</span>
              </div>
              <button
                type="button"
                tabIndex={flipped ? 0 : -1}
                onClick={toggleFlip}
                className="inline-flex items-center gap-1 rounded-lg border border-pop-border bg-pop-elevated px-2 py-1 text-[11px] font-medium text-gray-300 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pop-lime/70"
              >
                <ArrowLeft className="w-3 h-3" />
                返回正面
              </button>
            </div>

            {/* 20% / 50% / 30% Split Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-gray-400">
                <span>果实 $POP 双向分配</span>
                <span className="tabular-nums text-white font-semibold">
                  均额 {tier.avgPop.toLocaleString()} $POP
                </span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.06] gap-0.5">
                <div className="h-full bg-pop-lime" style={{ width: '20%' }} />
                <div className="h-full" style={{ width: '50%', backgroundColor: meta.color }} />
                <div className="h-full bg-white/40" style={{ width: '30%' }} />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                <div className="rounded-lg bg-pop-bg/70 border border-pop-border px-2 py-1.5">
                  <div className="text-gray-400">激活立领</div>
                  <div className="font-bold text-pop-lime tabular-nums">20%</div>
                </div>
                <div className="rounded-lg bg-pop-bg/70 border border-pop-border px-2 py-1.5">
                  <div className="text-gray-400">持有者解锁</div>
                  <div className="font-bold text-white tabular-nums">50%</div>
                </div>
                <div className="rounded-lg bg-pop-bg/70 border border-pop-border px-2 py-1.5">
                  <div className="text-gray-400">读者平分</div>
                  <div className="font-bold text-gray-200 tabular-nums">30%</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400 pt-2 border-t border-pop-border/80">
              <span>{REFERRAL_FORMULA[tier.tierId]}</span>
              <span className="shrink-0 text-gray-300 tabular-nums">72h 有效</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
