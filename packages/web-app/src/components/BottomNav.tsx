import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

const TABS = [
  { to: '/explore', label: '发现果实' },
  { to: '/mint', label: '果实首发' },
  { to: '/market', label: '果实集市' },
  { to: '/me', label: '我的资产' },
] as const;

/**
 * 04 Sliding Highlight — Persistent bottom tab bar with smooth elastic sliding pill
 * and iOS / Telegram Mini App safe-area support.
 */
export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-pop-border bg-[#090B10]/95 backdrop-blur-md pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto grid max-w-2xl grid-cols-4 gap-1 px-3 pt-2">
        {TABS.map(({ to, label }) => {
          const active = pathname === to || (to === '/explore' && pathname === '/');
          return (
            <NavLink
              key={to}
              to={to}
              className={`relative z-10 flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition-colors ${
                active ? 'text-pop-lime' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-highlight"
                  transition={{
                    type: 'spring',
                    stiffness: 420,
                    damping: 30,
                    mass: 0.78,
                  }}
                  className="absolute inset-0 -z-10 rounded-xl bg-pop-elevated border border-pop-borderHover"
                />
              )}
              <img className="w-6 h-6" alt="" src={`/assets/fruit-edition/ui${to}${active ? "-active" : ""}.svg`} />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
