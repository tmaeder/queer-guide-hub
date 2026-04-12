import { useCallback, useRef } from 'react';

type HapticPattern = 'success' | 'error' | 'nudge' | 'buzz';

const PATTERNS: Record<HapticPattern, number[]> = {
  success: [30, 60, 40],
  error: [40, 30, 40, 30, 40],
  nudge: [50],
  buzz: [80],
};

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function useHaptics() {
  const supported = useRef(typeof navigator !== 'undefined' && 'vibrate' in navigator);

  const trigger = useCallback((pattern: HapticPattern) => {
    if (!supported.current || prefersReducedMotion()) return;
    try {
      navigator.vibrate(PATTERNS[pattern]);
    } catch {
      // Silently fail on browsers that throw
    }
  }, []);

  return { trigger };
}

/** Standalone trigger for non-component contexts (toast system) */
export function hapticTrigger(pattern: HapticPattern) {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Silently fail
  }
}
