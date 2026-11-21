interface IconProps {
  className?: string;
}

/** Minimalist 14x14 monochrome X (Twitter) micro-icon */
export function XLogoIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M9.52 6.77 14.95.5h-1.29L8.95 5.95 5.19.5H.84l5.69 8.28L.84 15.5h1.29l4.98-5.76 3.97 5.76h4.35L9.52 6.77Zm-1.76 2.05-.58-.82L2.59 1.47h1.98l3.71 5.31.58.82 4.82 6.9h-1.98l-3.94-5.68Z" />
    </svg>
  );
}

/** Minimalist 14x14 monochrome Square / Feed micro-icon */
export function SquareLogoIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={className}>
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.5" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" strokeLinecap="round" />
    </svg>
  );
}

/** Minimalist 14x14 monochrome BSC / On-chain diamond micro-icon */
export function ChainDiamondIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" className={className}>
      <path d="M8 1.8 14.2 8 8 14.2 1.8 8 8 1.8Z" strokeLinejoin="round" />
      <path d="M8 5.2 10.8 8 8 10.8 5.2 8 8 5.2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlatformBadge({
  platform,
  className = '',
}: {
  platform: 'X' | 'BINANCE_SQUARE' | null;
  className?: string;
}) {
  const isSquare = platform === 'BINANCE_SQUARE';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-pop-elevated border border-pop-border px-1.5 py-0.5 text-[10px] font-medium text-gray-300 ${className}`}
    >
      {isSquare ? (
        <>
          <SquareLogoIcon className="w-3 h-3 text-gray-400" />
          <span>币安广场</span>
        </>
      ) : (
        <>
          <XLogoIcon className="w-2.5 h-2.5 text-gray-200" />
          <span className="sr-only">X</span>
        </>
      )}
    </span>
  );
}
