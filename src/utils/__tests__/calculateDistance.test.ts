import { describe, it, expect } from 'vitest';
import { calculateDistanceKm, calculateDistanceMeters } from '../calculateDistance';

describe('calculateDistanceKm', () => {
  it('should return 0 for same point', () => {
    expect(calculateDistanceKm(47.3769, 8.5417, 47.3769, 8.5417)).toBe(0);
  });

  it('should calculate Zurich to Berlin (~670 km)', () => {
    const dist = calculateDistanceKm(47.3769, 8.5417, 52.52, 13.405);
    expect(dist).toBeGreaterThan(650);
    expect(dist).toBeLessThan(690);
  });

  it('should calculate New York to London (~5570 km)', () => {
    const dist = calculateDistanceKm(40.7128, -74.006, 51.5074, -0.1278);
    expect(dist).toBeGreaterThan(5500);
    expect(dist).toBeLessThan(5600);
  });

  it('should handle antipodal points (~20000 km)', () => {
    const dist = calculateDistanceKm(0, 0, 0, 180);
    expect(dist).toBeCloseTo(20015, -1);
  });

  it('should be symmetric', () => {
    const ab = calculateDistanceKm(47.3769, 8.5417, 52.52, 13.405);
    const ba = calculateDistanceKm(52.52, 13.405, 47.3769, 8.5417);
    expect(ab).toBeCloseTo(ba, 10);
  });
});

describe('calculateDistanceMeters', () => {
  it('should return km * 1000', () => {
    const km = calculateDistanceKm(47.3769, 8.5417, 52.52, 13.405);
    const m = calculateDistanceMeters(47.3769, 8.5417, 52.52, 13.405);
    expect(m).toBeCloseTo(km * 1000, 5);
  });

  it('should return 0 for same point', () => {
    expect(calculateDistanceMeters(0, 0, 0, 0)).toBe(0);
  });
});
