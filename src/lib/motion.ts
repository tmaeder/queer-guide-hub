// ─── Motion Vocabulary ───────────────────────────────────────────────────────
// Shared springs, easings, variants, and reduced-motion tokens for the app.
// Built on `motion/react` (motion.dev). Import from here, not framer-motion.

import { useReducedMotion } from 'motion/react';
import type { Transition, Variants } from 'motion/react';
import { duration, stagger, distance } from './animation';

// ── Easings (cubic-bezier tuples for motion) ─────────────────────────────────
export const easing = {
  smooth: [0.22, 1, 0.36, 1] as [number, number, number, number],
  spring: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
  decel: [0, 0, 0.2, 1] as [number, number, number, number],
  accel: [0.4, 0, 1, 1] as [number, number, number, number],
};

// ── Spring presets ───────────────────────────────────────────────────────────
export const springs = {
  soft: { type: 'spring', stiffness: 170, damping: 26, mass: 1 } as Transition,
  snappy: { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 } as Transition,
  bouncy: { type: 'spring', stiffness: 300, damping: 18, mass: 1 } as Transition,
  gentle: { type: 'spring', stiffness: 120, damping: 20 } as Transition,
};

// ── Tween presets ────────────────────────────────────────────────────────────
export const tweens = {
  fast: { duration: duration.fast, ease: easing.smooth } as Transition,
  normal: { duration: duration.normal, ease: easing.smooth } as Transition,
  slow: { duration: duration.slow, ease: easing.smooth } as Transition,
  reveal: { duration: duration.reveal, ease: easing.smooth } as Transition,
};

// ── Reusable variants ────────────────────────────────────────────────────────
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: distance.md },
  visible: { opacity: 1, y: 0, transition: tweens.reveal },
};

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -distance.md },
  visible: { opacity: 1, y: 0, transition: tweens.reveal },
};

export const fadeLeft: Variants = {
  hidden: { opacity: 0, x: -distance.md },
  visible: { opacity: 1, x: 0, transition: tweens.reveal },
};

export const fadeRight: Variants = {
  hidden: { opacity: 0, x: distance.md },
  visible: { opacity: 1, x: 0, transition: tweens.reveal },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: tweens.reveal },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: springs.snappy },
};

export const slideUpLarge: Variants = {
  hidden: { opacity: 0, y: distance.lg },
  visible: { opacity: 1, y: 0, transition: springs.soft },
};

export const slideDownLarge: Variants = {
  hidden: { opacity: 0, y: -distance.lg },
  visible: { opacity: 1, y: 0, transition: springs.soft },
};

// ── Page transition variants ─────────────────────────────────────────────────
export const pageVariants: Variants = {
  initial: { opacity: 0, y: distance.sm },
  enter: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easing.smooth },
  },
  exit: {
    opacity: 0,
    scale: 0.99,
    transition: { duration: 0.15, ease: easing.accel },
  },
};

// ── Stagger helpers ──────────────────────────────────────────────────────────
export const staggerContainerVariants = (
  step: number = stagger.normal,
  delayChildren = 0,
): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: step, delayChildren },
  },
});

export const staggerItem: Variants = fadeUp;

// ── Direction → variant map ─────────────────────────────────────────────────
export type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'fade';

export const variantByDirection: Record<RevealDirection, Variants> = {
  up: fadeUp,
  down: fadeDown,
  left: fadeLeft,
  right: fadeRight,
  fade: fadeIn,
};

// ── Reduced-motion aware token hook ──────────────────────────────────────────
// Returns tokens flattened to instant when the user prefers reduced motion,
// so components destructure once and don't branch.
const flatVariant: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
};

const flatTransition: Transition = { duration: 0 };

export function useMotionTokens() {
  const reduced = useReducedMotion() ?? false;

  if (reduced) {
    return {
      reduced,
      tweens: {
        fast: flatTransition,
        normal: flatTransition,
        slow: flatTransition,
        reveal: flatTransition,
      },
      springs: {
        soft: flatTransition,
        snappy: flatTransition,
        bouncy: flatTransition,
        gentle: flatTransition,
      },
      fadeUp: flatVariant,
      fadeDown: flatVariant,
      fadeLeft: flatVariant,
      fadeRight: flatVariant,
      fadeIn: flatVariant,
      scaleIn: flatVariant,
      pageVariants: {
        initial: { opacity: 1 },
        enter: { opacity: 1 },
        exit: { opacity: 1 },
      } as Variants,
      variantByDirection: {
        up: flatVariant,
        down: flatVariant,
        left: flatVariant,
        right: flatVariant,
        fade: flatVariant,
      },
    };
  }

  return {
    reduced,
    tweens,
    springs,
    fadeUp,
    fadeDown,
    fadeLeft,
    fadeRight,
    fadeIn,
    scaleIn,
    pageVariants,
    variantByDirection,
  };
}

// Default viewport config for whileInView reveals
export const defaultViewport = {
  once: true,
  amount: 0.15,
  margin: '0px 0px -40px 0px',
} as const;
