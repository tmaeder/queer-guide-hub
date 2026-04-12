import { describe, it, expect } from 'vitest';
import { duration, ease, distance, stagger, transition, isLowEndDevice } from '../animation';

describe('animation tokens', () => {
  it('should export duration values', () => {
    expect(duration.instant).toBe(0.1);
    expect(duration.fast).toBe(0.2);
    expect(duration.normal).toBe(0.3);
    expect(duration.slow).toBe(0.5);
    expect(duration.reveal).toBe(0.7);
  });

  it('should export ease values as cubic-bezier strings', () => {
    expect(ease.smooth).toContain('cubic-bezier');
    expect(ease.spring).toContain('cubic-bezier');
    expect(ease.decel).toContain('cubic-bezier');
    expect(ease.accel).toContain('cubic-bezier');
  });

  it('should export distance values', () => {
    expect(distance.xs).toBe(4);
    expect(distance.sm).toBe(8);
    expect(distance.md).toBe(16);
    expect(distance.lg).toBe(40);
  });

  it('should export stagger values', () => {
    expect(stagger.fast).toBe(0.04);
    expect(stagger.normal).toBe(0.06);
    expect(stagger.slow).toBe(0.1);
  });

  it('should export transition shorthand strings', () => {
    expect(transition.fast).toContain('0.2s');
    expect(transition.normal).toContain('0.3s');
    expect(transition.slow).toContain('0.5s');
  });
});

describe('isLowEndDevice', () => {
  it('should return boolean', () => {
    expect(typeof isLowEndDevice()).toBe('boolean');
  });
});
