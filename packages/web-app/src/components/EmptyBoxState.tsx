interface EmptyBoxStateProps {
  scene: 'no-active' | 'no-collection' | 'no-listings';
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * 240x240 Minimalist Isometric Empty Blind-Box Wireframe Silhouette
 * for clean arcade empty states across Explore, Market, and Me pages.
 */
export function EmptyBoxState({ scene, title, description, action }: EmptyBoxStateProps) {
  return (
    <div className="rounded-2xl border border-pop-border bg-pop-card px-6 py-8 text-center flex flex-col items-center gap-3">
      <img src={`/assets/fruit-edition/scenes/${scene}.png`} className="w-40" alt="" />

      <div className="space-y-1">
        <div className="text-sm font-bold text-gray-200">{title}</div>
        {description && <p className="text-xs text-gray-500 max-w-xs mx-auto">{description}</p>}
      </div>

      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
