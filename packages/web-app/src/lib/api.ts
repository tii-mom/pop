import { handleMockApi } from './mockApi';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const fruitErrors: Record<string, string> = {
  ALREADY_OPENED: '你已经领过这颗果实。',
  BOX_EXPIRED: '这颗果实已过期。',
  BOX_COMPLETED: '这颗果实已领完。',
  BOX_NOT_ACTIVE: '这颗果实当前无法领取。',
  CANNOT_OPEN_OWN_BOX: '这是你分享的果实，邀请朋友来阅读领取。',
  ATTEMPT_EXPIRED: '答题时间已过，请重新打开邀请。',
};

const TOKEN_KEY = 'pop_box_jwt';

export const IS_MOCK_MODE = import.meta.env.VITE_USE_MOCK === 'true';

export function getAuthToken(): string | null {
  if (IS_MOCK_MODE) return 'mock-jwt-token';
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (IS_MOCK_MODE) return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (IS_MOCK_MODE) {
    return handleMockApi<T>(path, options);
  }

  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      (data as { message?: string; error?: string }).message ||
      (data as { error?: string }).error ||
      `HTTP ${res.status}`;
    throw new Error(fruitErrors[errMsg] ?? errMsg);
  }
  return data as T;
}
