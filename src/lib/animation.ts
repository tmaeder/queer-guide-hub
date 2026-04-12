// ─── Animation Design Tokens ─────────────────────────────────────────────────
// Single source of truth for all animation values across the platform.
// Import these instead of hardcoding durations/easings in components.

export const duration = {
  instant: 0.1,
  fast: 0.2,
  normal: 0.3,
  slow: 0.5,
  reveal: 0.7,
} as const;

export const ease = {
  smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
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
