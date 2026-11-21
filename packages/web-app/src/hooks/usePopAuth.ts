import { useCallback, useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { retrieveRawInitData } from '@tma.js/sdk';
import { IS_MOCK_MODE, apiFetch, getAuthToken, setAuthToken } from '../lib/api';

export interface MeProfile {
  id: string;
  walletAddress: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
  xUsername: string | null;
  xFollowers: number;
  binanceSquareUrl: string | null;
  squareFollowers: number;
  squareVerified: boolean;
  bnbAvailable: string;
  bnbLocked: string;
  popAvailable: string;
  popPendingClaim: string;
  popClaimedTotal: string;
  riskLevel: string;
  hasPriorityPass: boolean;
  isWhaleWhitelisted: boolean;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: { start_param?: string };
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

const REFERRER_STORAGE_KEY = 'pop_box_referrer_wallet';

export function captureReferrerFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref && /^0x[a-fA-F0-9]{40}$/.test(ref)) {
    localStorage.setItem(REFERRER_STORAGE_KEY, ref);
    return ref;
  }
  return localStorage.getItem(REFERRER_STORAGE_KEY);
}

export function getSavedReferrer(): `0x${string}` {
  const saved = localStorage.getItem(REFERRER_STORAGE_KEY);
  if (saved && /^0x[a-fA-F0-9]{40}$/.test(saved)) {
    return saved as `0x${string}`;
  }
  return '0x0000000000000000000000000000000000000000';
}

export function detectStartBoxParam(): { boxId: string | null; tgGroupId: string | null } {
  const urlParams = new URLSearchParams(window.location.search);
  const startParam =
    window.Telegram?.WebApp?.initDataUnsafe?.start_param || urlParams.get('startapp') || '';

  if (startParam.startsWith('box_')) {
    const parts = startParam.slice(4).split('_grp_');
    return { boxId: parts[0] || null, tgGroupId: parts[1] || null };
  }
  return { boxId: urlParams.get('boxId'), tgGroupId: urlParams.get('tgGroupId') };
}

export function usePopAuth() {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTma, setIsTma] = useState(false);

  const refreshProfile = useCallback(async () => {
    if (!IS_MOCK_MODE && !getAuthToken()) {
      setProfile(null);
      return;
    }
    try {
      const me = await apiFetch<MeProfile>('/users/me');
      setProfile(me);
    } catch {
      setAuthToken(null);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    captureReferrerFromUrl();

    if (IS_MOCK_MODE) {
      refreshProfile();
      return;
    }

    const tgWebApp = window.Telegram?.WebApp;
    let initDataRaw = tgWebApp?.initData || '';
    if (!initDataRaw) {
      try {
        initDataRaw = retrieveRawInitData() || '';
      } catch {
        // Not inside TMA
      }
    }

    if (initDataRaw) {
      setIsTma(true);
      tgWebApp?.ready?.();
      tgWebApp?.expand?.();

      if (!getAuthToken()) {
        setLoading(true);
        apiFetch<{ token: string }>('/auth/telegram-login', {
          method: 'POST',
          body: JSON.stringify({ initData: initDataRaw }),
        })
          .then((res) => {
            setAuthToken(res.token);
            return refreshProfile();
          })
          .catch((err) => setError(err instanceof Error ? err.message : 'TMA 登录失败'))
          .finally(() => setLoading(false));
      } else {
        refreshProfile();
      }
    } else {
      refreshProfile();
    }
  }, [refreshProfile]);

  const loginWithWallet = useCallback(async () => {
    if (IS_MOCK_MODE) {
      await refreshProfile();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      let activeAddr = address;
      if (!isConnected || !activeAddr) {
        const injectedConnector = connectors[0];
        if (!injectedConnector) throw new Error('未检测到 Web3 钱包（MetaMask / 币安 Web3 钱包）');
        const res = await connectAsync({ connector: injectedConnector });
        activeAddr = res.accounts[0];
      }

      const { message } = await apiFetch<{ message: string }>(
        `/auth/nonce?address=${activeAddr}`
      );
      const signature = await signMessageAsync({ message });
      const loginRes = await apiFetch<{ token: string }>('/auth/wallet-login', {
        method: 'POST',
        body: JSON.stringify({ address: activeAddr, signature }),
      });

      setAuthToken(loginRes.token);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : '钱包签名登录失败');
    } finally {
      setLoading(false);
    }
  }, [address, isConnected, connectors, connectAsync, signMessageAsync, refreshProfile]);

  const logout = useCallback(() => {
    setAuthToken(null);
    setProfile(null);
    disconnect();
  }, [disconnect]);

  return {
    profile,
    isTma,
    isMock: IS_MOCK_MODE,
    isAuthenticated: Boolean(profile),
    loading,
    error,
    walletAddress: address ?? profile?.walletAddress ?? null,
    loginWithWallet,
    refreshProfile,
    logout,
  };
}
