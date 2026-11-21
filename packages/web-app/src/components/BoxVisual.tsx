import { motion } from 'framer-motion';
import { useTierVisualMeta } from '../lib/artPack';

// Re-export hook & static fallback helper for callers that only need tier metadata
export { useTierVisualMeta };

export { getTierVisualMeta } from '../lib/artPack';

interface BoxVisualProps {
  tierId: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  openedSrc?: string;
  isOpened?: boolean;
  className?: string;
  /** Keep false in high-frequency lists; enable only on showcase/emotional moments */
  animateFloat?: boolean;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'w-12 h-12 rounded-xl',
  md: 'w-16 h-16 rounded-xl',
  lg: 'w-24 h-24 rounded-2xl',
  xl: 'w-32 h-32 rounded-2xl',
};

export function BoxVisual({
  tierId,
  size = 'md',
  openedSrc,
  isOpened = false,
  className = '',
  animateFloat = false,
}: BoxVisualProps) {
  const meta = useTierVisualMeta(tierId);
  const imgSrc = isOpened ? (openedSrc ?? meta.openSrc) : meta.src;

  if (!animateFloat) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden bg-[#0D1017] border ${meta.borderClass} ${SIZE_CLASSES[size]} ${className}`}
      >
        <img
          src={imgSrc}
          alt={meta.name}
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.06]" />
      </div>
    );
  }

  return (
    <motion.div
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
      className={`relative shrink-0 overflow-hidden bg-[#0D1017] border ${meta.borderClass} ${SIZE_CLASSES[size]} ${className}`}
    >
      <img
        src={imgSrc}
        alt={meta.name}
        loading="lazy"
        className="h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.08]" />
    </motion.div>
  );
}
