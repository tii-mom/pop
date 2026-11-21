import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LayoutGroup, motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { BottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AnimatedNumber } from './components/DataAwakening';
import { useArtPack } from './lib/artPack';
import { usePopAuth } from './hooks/usePopAuth';
import { resetMockState } from './lib/mockApi';
import { ExplorePage } from './pages/ExplorePage';
import { MintPage } from './pages/MintPage';
import { MarketPage } from './pages/MarketPage';
import { MePage } from './pages/MePage';

function AppShell() {
  const auth = usePopAuth();
  const location = useLocation();
  const { pack } = useArtPack();

  useEffect(() => {
    if (auth.isMock) void auth.refreshProfile();
  }, [auth.isMock, auth.refreshProfile, location.search]);

  const handleResetMock = () => {
    resetMockState();
    window.location.reload();
  };

  return (
    <LayoutGroup>
      <div className="min-h-screen bg-pop-bg pb-24">
        {/* Clean Minimal Top Bar */}
        <header className="sticky top-0 z-30 border-b border-pop-border bg-[#090B10]/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                to="/explore"
                className="flex items-center gap-2 rounded-lg shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pop-lime/70"
              >
                <picture className="block shrink-0">
                  <source media="(prefers-reduced-motion: reduce)" srcSet="/assets/fruit-edition/brand/pop-full.svg" />
                  <img src="/assets/fruit-edition/brand/pop-motion.gif" alt="POP 果实" className="block h-12 w-14 object-contain" />
                </picture>
                <span className="text-sm font-black tracking-tight text-white">
                  POP <span className="text-pop-lime">果实</span>
                </span>
              </Link>

            </div>

            <div className="flex items-center gap-2 shrink-0">
              {auth.isMock && <span className="text-[10px] text-pop-lime">{location.search.includes("boxId=") ? "演示 · 朋友" : "本地演示"}</span>}
              {auth.isMock && (
                <button
                  type="button"
                  onClick={handleResetMock}
                  title="重置演示数据"
                  aria-label="重置演示数据"
                  className="rounded-lg border border-pop-border bg-pop-card p-1.5 text-gray-400 hover:border-pop-borderHover hover:text-white transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}

              {auth.isAuthenticated ? (
                <Link
                  to="/me"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-pop-card border border-pop-border px-2.5 py-1.5 text-xs font-bold text-white hover:border-pop-borderHover transition"
                >
                  {pack.tokenIconSrc ? (
                    <img
                      src={pack.tokenIconSrc}
                      alt="$POP"
                      className="h-4 w-4 rounded-full object-contain shrink-0"
                    />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-pop-lime" />
                  )}
                  <AnimatedNumber value={Number(auth.profile?.popAvailable ?? 0)} />{' '}
                  <span className="text-pop-lime">$POP</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={auth.loginWithWallet}
                  disabled={auth.loading}
                  className="arcade-btn rounded-lg px-3.5 py-1.5 text-xs"
                >
                  {auth.loading ? '连接中...' : '连接钱包'}
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-5">
          {auth.error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
              {auth.error}
            </div>
          )}

          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <Routes>
              <Route
                path="/explore"
                element={
                  <ExplorePage
                    isAuthenticated={auth.isAuthenticated}
                    isTma={auth.isTma}
                    onRequireLogin={auth.loginWithWallet}
                    onRewardClaimed={auth.refreshProfile}
                  />
                }
              />
              <Route
                path="/mint"
                element={
                  <MintPage
                    isAuthenticated={auth.isAuthenticated}
                    walletAddress={auth.walletAddress}
                    onMinted={auth.refreshProfile}
                  />
                }
              />
              <Route
                path="/market"
                element={
                  <MarketPage
                    isAuthenticated={auth.isAuthenticated}
                    currentUserId={auth.profile?.id ?? null}
                    onRequireLogin={auth.loginWithWallet}
                    onPurchased={auth.refreshProfile}
                  />
                }
              />
              <Route
                path="/me"
                element={
                  <MePage
                    profile={auth.profile}
                    onLoginWallet={auth.loginWithWallet}
                    onRefreshProfile={auth.refreshProfile}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/explore" replace />} />
            </Routes>
          </motion.div>
        </main>

        <BottomNav />
      </div>
    </LayoutGroup>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      
        <AppShell />
      
    </ErrorBoundary>
  );
}
