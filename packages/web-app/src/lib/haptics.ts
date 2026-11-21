/**
 * Silent Telegram Mini App HapticFeedback bridge (zero audio / zero Web Audio API).
 */
export function triggerHaptic(kind: 'light' | 'medium' | 'heavy' | 'success'): void {
  const haptic = (
    window as unknown as {
      Telegram?: {
        WebApp?: {
          HapticFeedback?: {
            impactOccurred?: (style: 'light' | 'medium' | 'heavy') => void;
            notificationOccurred?: (type: 'success' | 'warning' | 'error') => void;
          };
        };
      };
    }
  ).Telegram?.WebApp?.HapticFeedback;

  if (!haptic) return;
  if (kind === 'success') {
    haptic.notificationOccurred?.('success');
  } else {
    haptic.impactOccurred?.(kind);
  }
}
