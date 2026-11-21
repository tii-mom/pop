import { env } from '../config/env.js';

export async function verifyTurnstileToken(
  token: string | undefined,
  remoteIp?: string
): Promise<boolean> {
  // In local dev/test without secret key configured, accept non-empty token
  if (!env.TURNSTILE_SECRET_KEY) {
    return Boolean(token && token.length > 0);
  }
  if (!token) return false;

  try {
    const form = new URLSearchParams();
    form.set('secret', env.TURNSTILE_SECRET_KEY);
    form.set('response', token);
    if (remoteIp) form.set('remoteip', remoteIp);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}
