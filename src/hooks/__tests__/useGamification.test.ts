import { describe, it, expect } from 'vitest';
import {
  levelName,
  pointsForLevel,
  progressToNextLevel,
} from '@/hooks/useGamification';

describe('useGamification helpers', () => {
  describe('levelName', () => {
    it('maps each level to a name within range', () => {
      const names = Array.from({ length: 10 }, (_, i) => levelName(i + 1));
      expect(new Set(names).size).toBe(10);
      expect(levelName(1)).toBe('Newcomer');
      expect(levelName(10)).toBe('Icon');
    });

    it('clamps out-of-range levels', () => {
      expect(levelName(0)).toBe('Newcomer');
      expect(levelName(99)).toBe('Icon');
    });
  });

  describe('pointsForLevel', () => {
    it('matches compute_level inverse: floor(sqrt(points/50))+1', () => {
      // pointsForLevel(L) = (L-1)^2 * 50  →  inverse of SQL compute_level
      expect(pointsForLevel(1)).toBe(0);
      expect(pointsForLevel(2)).toBe(50);
      expect(pointsForLevel(3)).toBe(200);
      expect(pointsForLevel(4)).toBe(450);
      expect(pointsForLevel(10)).toBe(4050);
    });
  });

  describe('progressToNextLevel', () => {
    it('returns 0 at level floor', () => {
      expect(progressToNextLevel(0, 1)).toBeCloseTo(0);
      expect(progressToNextLevel(50, 2)).toBeCloseTo(0);
    });

    it('returns 1 at level ceiling', () => {
      expect(progressToNextLevel(50, 1)).toBeCloseTo(1);
      expect(progressToNextLevel(200, 2)).toBeCloseTo(1);
    });

    it('caps at 1 when level is max', () => {
      expect(progressToNextLevel(99999, 10)).toBe(1);
    });

    it('returns a value in [0, 1] otherwise', () => {
      const p = progressToNextLevel(120, 2);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    });
  });
});
