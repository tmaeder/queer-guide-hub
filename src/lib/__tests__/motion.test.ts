import { describe, it, expect } from 'vitest';
import {
  easing,
  springs,
  tweens,
  fadeUp,
  fadeDown,
  fadeLeft,
  fadeRight,
  fadeIn,
  scaleIn,
  slideUpLarge,
  slideDownLarge,
  pageVariants,
  staggerContainerVariants,
  staggerItem,
  variantByDirection,
  defaultViewport,
} from '../motion';

describe('easing', () => {
  it('should export tuples with 4 values', () => {
    expect(easing.smooth).toHaveLength(4);
    expect(easing.spring).toHaveLength(4);
    expect(easing.decel).toHaveLength(4);
    expect(easing.accel).toHaveLength(4);
  });
});

describe('springs', () => {
  it('should have spring type transitions', () => {
    expect(springs.soft).toHaveProperty('type', 'spring');
    expect(springs.snappy).toHaveProperty('type', 'spring');
    expect(springs.bouncy).toHaveProperty('type', 'spring');
    expect(springs.gentle).toHaveProperty('type', 'spring');
  });
});

describe('tweens', () => {
  it('should have increasing durations', () => {
    expect(tweens.fast.duration).toBeLessThan(tweens.normal.duration as number);
    expect(tweens.normal.duration).toBeLessThan(tweens.slow.duration as number);
    expect(tweens.slow.duration).toBeLessThan(tweens.reveal.duration as number);
  });
});

describe('variants', () => {
  it('fadeUp should start hidden below', () => {
    expect(fadeUp.hidden).toHaveProperty('opacity', 0);
    expect((fadeUp.hidden as any).y).toBeGreaterThan(0);
  });

  it('fadeDown should start hidden above', () => {
    expect((fadeDown.hidden as any).y).toBeLessThan(0);
  });

  it('fadeLeft should start hidden to the left', () => {
    expect((fadeLeft.hidden as any).x).toBeLessThan(0);
  });

  it('fadeRight should start hidden to the right', () => {
    expect((fadeRight.hidden as any).x).toBeGreaterThan(0);
  });

  it('fadeIn should only animate opacity', () => {
    expect(fadeIn.hidden).toEqual({ opacity: 0 });
  });

  it('scaleIn should animate scale', () => {
    expect((scaleIn.hidden as any).scale).toBeLessThan(1);
  });

  it('slideUpLarge should use larger distance than fadeUp', () => {
    expect((slideUpLarge.hidden as any).y).toBeGreaterThan((fadeUp.hidden as any).y);
  });

  it('pageVariants should have initial, enter, and exit', () => {
    expect(pageVariants).toHaveProperty('initial');
    expect(pageVariants).toHaveProperty('enter');
    expect(pageVariants).toHaveProperty('exit');
  });
});

describe('staggerContainerVariants', () => {
  it('should return variants with staggerChildren', () => {
    const variants = staggerContainerVariants(0.1);
    const visible = variants.visible as any;
    expect(visible.transition.staggerChildren).toBe(0.1);
  });

  it('should accept delayChildren', () => {
    const variants = staggerContainerVariants(0.1, 0.5);
    const visible = variants.visible as any;
    expect(visible.transition.delayChildren).toBe(0.5);
  });
});

describe('staggerItem', () => {
  it('should equal fadeUp', () => {
    expect(staggerItem).toBe(fadeUp);
  });
});

describe('variantByDirection', () => {
  it('should map all directions', () => {
    expect(variantByDirection.up).toBe(fadeUp);
    expect(variantByDirection.down).toBe(fadeDown);
    expect(variantByDirection.left).toBe(fadeLeft);
    expect(variantByDirection.right).toBe(fadeRight);
    expect(variantByDirection.fade).toBe(fadeIn);
  });
});

describe('defaultViewport', () => {
  it('should have once set to true', () => {
    expect(defaultViewport.once).toBe(true);
  });

  it('should have amount set', () => {
    expect(defaultViewport.amount).toBe(0.15);
  });
});
