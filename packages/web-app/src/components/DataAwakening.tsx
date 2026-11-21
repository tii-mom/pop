import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * 01 Data Awakening — Smooth ease-out counter from 0 (or previous value on update).
 * Uses tabular-nums to prevent layout jitter and stays strictly stable once settled.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  durationMs = 620,
  prefix = '',
  suffix = '',
  className = '',
}: AnimatedNumberProps) {
  const prefersReduced = useReducedMotion();
  const safeTarget = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(prefersReduced ? safeTarget : 0);
  const prevRef = useRef<number>(prefersReduced ? safeTarget : 0);

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(safeTarget);
      prevRef.current = safeTarget;
      return;
    }

    const from = prevRef.current;
    const delta = safeTarget - from;
    if (Math.abs(delta) < 1e-9) {
      setDisplay(safeTarget);
      return;
    }

    const start = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + delta * eased);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplay(safeTarget);
        prevRef.current = safeTarget;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [safeTarget, durationMs, prefersReduced]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

interface AnimatedProgressBarProps {
  percent: number;
  color?: string;
  trackClassName?: string;
  heightClassName?: string;
  delay?: number;
}

/**
 * 01 Data Awakening — Single solid color progress bar that draws smoothly left-to-right.
 */
export function AnimatedProgressBar({
  percent,
  color = '#B8FF2C',
  trackClassName = 'bg-white/[0.07]',
  heightClassName = 'h-1.5',
  delay = 0.08,
}: AnimatedProgressBarProps) {
  const prefersReduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className={`w-full overflow-hidden rounded-full ${trackClassName} ${heightClassName}`}>
      <motion.div
        initial={prefersReduced ? false : { width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{
          duration: prefersReduced ? 0 : 0.65,
          delay: prefersReduced ? 0 : delay,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

interface AwakenItemProps {
  index?: number;
  children: React.ReactNode;
  className?: string;
}

/**
 * 01 Data Awakening — Subtle staggered entrance that settles cleanly.
 */
export function AwakenItem({ index = 0, children, className = '' }: AwakenItemProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.32,
        delay: Math.min(index * 0.04, 0.24),
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
