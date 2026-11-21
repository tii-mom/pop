import { fruitImage } from '../lib/artPack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, X, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { BoxVisual, getTierVisualMeta } from './BoxVisual';
import { BoxOpeningStage, type OpeningStage } from './BoxOpeningStage';
import { CompliantPosterCanvas } from './CompliantPosterCanvas';

interface QuizModalProps {
  box: {
    id: string;
    sharer?: string | null;
    remainingReaderPop?: string;
    tierId: number;
    claimedClicks: number;
    maxClicks: number;
    contentTitle: string | null;
    platform: 'X' | 'BINANCE_SQUARE' | null;
    targetUrl: string | null;
  };
  layoutId?: string;
  source: 'TMA' | 'WEB';
  tgGroupId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface StartQuizResp {
  attemptToken: string;
  targetUrl: string | null;
  questionText: string;
  options: [string, string, string];
  minReadDurationMs: number;
  requiresTurnstile: boolean;
}

interface SubmitQuizResp {
  correct: boolean;
  readerPop?: string;
  claimedClicks?: number;
  maxClicks?: number;
  quizWrongStreak?: number;
  requiresTurnstileNext?: boolean;
}

const MIN_CHARGING_MS = 800;
const BURST_DURATION_MS = 250;

export function QuizModal({ box, layoutId, source, tgGroupId, onClose, onSuccess }: QuizModalProps) {
  const [quiz, setQuiz] = useState<StartQuizResp | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(5);
  const [countdown, setCountdown] = useState(5);
  const [selected, setSelected] = useState<number | null>(null);
  const [wrongIndex, setWrongIndex] = useState<number | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [openingStage, setOpeningStage] = useState<OpeningStage | null>(null);
  const [settledImage, setSettledImage] = useState<string>();
  const [rewardPop, setRewardPop] = useState<number>(0);

  const mountedRef = useRef(true);
  const burstTimerRef = useRef<number | null>(null);

  const meta = getTierVisualMeta(box.tierId);
  const canClose = openingStage === null || openingStage === 'settled';

  // Lock background scroll while modal is open & clean up pending timers on unmount
  useEffect(() => {
    mountedRef.current = true;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      mountedRef.current = false;
      document.body.style.overflow = prevOverflow;
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current);
      }
    };
  }, []);

  // Escape key dismissal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canClose, onClose]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<StartQuizResp>(`/open/${box.id}/start`, { method: 'POST', body: '{}' })
      .then((res) => {
        if (cancelled) return;
        setQuiz(res);
        const secs = Math.max(1, Math.ceil((res.minReadDurationMs || 5000) / 1000));
        setTotalSeconds(secs);
        setCountdown(secs);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '无法加载果实题目');
      });
    return () => {
      cancelled = true;
    };
  }, [box.id]);

  useEffect(() => {
    if (!quiz || countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [quiz, countdown]);

  const handleSettled = useCallback(() => {
    if (mountedRef.current) {
      setOpeningStage('settled');
    }
  }, []);

  const handleSelectAndSubmit = async (optionIdx: number) => {
    if (!quiz || countdown > 0 || openingStage !== null) return;

    setSelected(optionIdx);
    setWrongIndex(null);
    setError(null);
    setOpeningStage('charging');

    const minChargeWait = new Promise<void>((resolve) => window.setTimeout(resolve, MIN_CHARGING_MS));

    try {
      const [res] = await Promise.all([
        apiFetch<SubmitQuizResp>(`/open/${box.id}/submit`, {
          method: 'POST',
          body: JSON.stringify({
            attemptToken: quiz.attemptToken,
            selectedIndex: optionIdx,
            source,
            tgGroupId: tgGroupId || undefined,
            turnstileToken: quiz.requiresTurnstile ? turnstileToken || 'verified-client' : undefined,
          }),
        }),
        minChargeWait,
      ]);

      if (!mountedRef.current) return;

      if (res.correct && res.readerPop) {
        const earned = Number(res.readerPop);
        setSettledImage(fruitImage(box.tierId, res.claimedClicks ?? box.claimedClicks + 1, res.maxClicks ?? box.maxClicks));
        setRewardPop(earned);
        setOpeningStage('burst');
        onSuccess();

        burstTimerRef.current = window.setTimeout(() => {
          if (mountedRef.current) {
            setOpeningStage('reveal');
          }
        }, BURST_DURATION_MS);
      } else {
        setOpeningStage(null);
        setSelected(null);
        setWrongIndex(optionIdx);
        setError('回答错误，请核对原帖后再选。');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setOpeningStage(null);
      setSelected(null);
      setError(err instanceof Error ? err.message : '提交失败，请重试');
    }
  };

  const readProgressPct = totalSeconds > 0 ? ((totalSeconds - countdown) / totalSeconds) * 100 : 100;

  if (openingStage !== null) {
    return (
      <BoxOpeningStage
        stage={openingStage}
        initialImageSrc={fruitImage(box.tierId, box.claimedClicks, box.maxClicks)}
        openedImageSrc={settledImage}
        tierId={box.tierId}
        rewardPop={rewardPop}
        onSettled={handleSettled}
        onClose={onClose}
      >
        <div className="space-y-3">
          <CompliantPosterCanvas
            rewardPop={rewardPop.toFixed(2)}
            tierId={box.tierId}
            platform={box.platform}
            fruitSrc={settledImage ?? fruitImage(box.tierId, box.claimedClicks, box.maxClicks)}
            postTitle={box.contentTitle || 'POP 果实 精选内容'}
          />
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-pop-border bg-pop-card py-2.5 text-xs font-semibold text-gray-300 hover:border-pop-borderHover hover:text-white transition"
          >
            返回发现果实
          </button>
        </div>
      </BoxOpeningStage>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && canClose) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="果实答题领取"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div
        layoutId={layoutId}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="relative w-full max-w-md rounded-2xl bg-pop-card border border-pop-borderHover p-5 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 24px 60px -16px rgba(0,0,0,0.85)' }}
      >
        {canClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-50 rounded-lg p-1 text-gray-400 hover:bg-pop-elevated hover:text-white transition"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.05 }}
          className="space-y-4"
        >
            {/* Header */}
            <div className="flex items-center gap-3 pr-7">
              <BoxVisual tierId={box.tierId} size="sm" isOpened openedSrc={fruitImage(box.tierId, box.claimedClicks, box.maxClicks)} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      color: meta.color,
                      backgroundColor: `${meta.color}18`,
                    }}
                  >
                    {meta.shortLabel}
                  </span>
                  <span className="text-xs font-bold text-white">答题领取</span>
                </div>
                <h2 className="text-base font-bold text-white leading-snug mt-1">
                  {box.contentTitle || '好友分享的内容'}
                </h2>
                <p className="mt-1 text-xs text-gray-400">{box.sharer ? `@${box.sharer} 分享 · ` : ''}{box.remainingReaderPop && `读者可领 ${box.remainingReaderPop} POP`}</p>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-xs text-red-300">
                {error}
              </div>
            )}

            {!quiz && !error && (
              <div className="space-y-2.5 py-2">
                <div className="h-11 rounded-xl bg-pop-elevated animate-pulse" />
                <div className="h-5 w-4/5 rounded bg-pop-elevated animate-pulse" />
                <div className="h-12 rounded-xl bg-pop-elevated animate-pulse" />
                <div className="h-12 rounded-xl bg-pop-elevated animate-pulse" />
              </div>
            )}

            {quiz && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Reading Gate Bar */}
                <div className="rounded-xl bg-pop-bg border border-pop-border p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-300 tabular-nums">
                      {countdown > 0 ? (
                        <>
                          阅读原帖满 <span className="text-pop-lime font-bold">{countdown}s</span> 解锁答题
                        </>
                      ) : (
                        <span className="text-pop-lime font-semibold">已解锁 · 点击答案立即领取</span>
                      )}
                    </div>
                    {(quiz.targetUrl || box.targetUrl) && (
                      <a
                        href={quiz.targetUrl || box.targetUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-pop-elevated border border-pop-borderHover px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition"
                      >
                        读原帖 <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-pop-lime transition-all duration-500 ease-out"
                      style={{ width: `${readProgressPct}%` }}
                    />
                  </div>
                </div>

                {quiz.requiresTurnstile && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold">
                      <ShieldAlert className="w-4 h-4" /> 连续答错触发人机验证
                    </div>
                    <input
                      type="text"
                      value={turnstileToken}
                      onChange={(e) => setTurnstileToken(e.target.value)}
                      placeholder="输入 Turnstile 验证令牌"
                      className="w-full rounded-lg bg-pop-bg border border-pop-border px-3 py-2 text-xs text-white focus:border-pop-lime focus:outline-none"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-sm font-semibold text-white leading-relaxed">
                    {quiz.questionText}
                  </div>
                  {quiz.options.map((opt, idx) => {
                    const isWrong = wrongIndex === idx;
                    const isSelected = selected === idx;
                    return (
                      <motion.button
                        key={idx}
                        type="button"
                        disabled={countdown > 0}
                        animate={isWrong ? { x: [0, -5, 5, -3, 3, 0] } : { x: 0 }}
                        transition={{ duration: 0.28 }}
                        onClick={() => handleSelectAndSubmit(idx)}
                        className={`w-full text-left rounded-xl border px-3.5 py-3 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${
                          isWrong
                            ? 'border-red-500/60 bg-red-500/10 text-red-200'
                            : isSelected
                              ? 'border-pop-lime bg-pop-lime/10 text-pop-lime font-semibold'
                              : 'border-pop-border bg-pop-bg/70 text-gray-200 hover:border-pop-borderHover hover:bg-pop-elevated'
                        }`}
                      >
                        <span className="mr-2 font-mono text-xs text-gray-500">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        {opt}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </motion.div>
      </motion.div>
    </motion.div>
  );
}
