import { motion } from 'framer-motion';

export interface SlidingTabItem<T extends string | number> {
  key: T;
  label: string;
  count?: number;
}

interface SlidingTabsProps<T extends string | number> {
  layoutId: string;
  items: readonly SlidingTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'lime' | 'neutral';
  fullWidth?: boolean;
  className?: string;
}

/**
 * 04 Sliding Highlight — Shared-layout rounded pill indicator that slides smoothly
 * between options, adapting width & height with a subtle elastic spring.
 */
export function SlidingTabs<T extends string | number>({
  layoutId,
  items,
  value,
  onChange,
  variant = 'lime',
  fullWidth = false,
  className = '',
}: SlidingTabsProps<T>) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border border-pop-border bg-pop-card p-1 overflow-x-auto no-scrollbar ${
        fullWidth ? 'flex w-full' : ''
      } ${className}`}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={String(item.key)}
            type="button"
            onClick={() => onChange(item.key)}
            className={`relative z-10 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              fullWidth ? 'flex-1 text-center' : ''
            } ${
              active
                ? variant === 'lime'
                  ? 'text-black'
                  : 'text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{
                  type: 'spring',
                  stiffness: 420,
                  damping: 30,
                  mass: 0.75,
                }}
                className={`absolute inset-0 -z-10 rounded-lg ${
                  variant === 'lime'
                    ? 'bg-pop-lime'
                    : 'bg-pop-elevated border border-pop-borderHover'
                }`}
              />
            )}
            <span className="inline-flex items-center justify-center gap-1">
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span
                  className={`tabular-nums text-[10px] ${
                    active
                      ? variant === 'lime'
                        ? 'text-black/70'
                        : 'text-gray-300'
                      : 'text-gray-500'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
