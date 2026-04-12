import { useReducedMotion as useReducedMotionMotion } from 'motion/react';

/**
 * Re-exported from motion/react, flattened to always return boolean
 * (motion's hook returns `boolean | null` during SSR).
 */
export function useReducedMotion(): boolean {
  return useReducedMotionMotion() ?? false;
}
