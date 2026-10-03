// ─── Animation Design Tokens ─────────────────────────────────────────────────
// Single source of truth for all animation values across the platform.
// Import these instead of hardcoding durations/easings in components.

export const duration = {
  instant: 0.14,
  fast: 0.2,
  normal: 0.3,
  slow: 0.5,
  journey: 0.62,
  reveal: 0.7,
  burst: 0.65,
  celebration: 1.1,
} as const;

/** Millisecond form for imperative animation APIs (maps and graph canvases). */
export const durationMs = {
  instant: duration.instant * 1000,
  fast: duration.fast * 1000,
  normal: duration.normal * 1000,
  slow: duration.slow * 1000,
  journey: duration.journey * 1000,
  reveal: duration.reveal * 1000,
} as const;

/** Respect reduced motion when an imperative library cannot consume CSS media queries. */
export function imperativeDurationMs(value: number): number {
  if (typeof window === 'undefined') return value;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : value;
}

export const ease = {
  smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
  // spring (overshoot 1.56) removed 2026-07-11 — bounce/elastic easing is
  // banned outside the /messages joy zone (framer springs live in lib/motion).
  decel: 'cubic-bezier(0, 0, 0.2, 1)',
  accel: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

export const distance = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 40,
} as const;

export const stagger = {
  fast: 0.04,
  normal: 0.06,
  slow: 0.1,
} as const;

// CSS transition shorthand helpers
export const transition = {
  fast: `all ${duration.fast}s ${ease.smooth}`,
  normal: `all ${duration.normal}s ${ease.smooth}`,
  slow: `all ${duration.slow}s ${ease.smooth}`,
} as const;

// Check if device is low-end (disable complex stagger animations)
export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.hardwareConcurrency != null && navigator.hardwareConcurrency < 4;
}
