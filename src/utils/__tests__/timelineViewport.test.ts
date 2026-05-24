import { describe, it, expect } from 'vitest';
import {
  panBy,
  zoomBy,
  centerOn,
  fitToData,
  clampSpan,
  stepFor,
  MIN_SPAN_MS,
  MAX_SPAN_MS,
  defaultViewport,
  pxForMs,
  msForPx,
} from '../timelineViewport';

const DAY = 86_400_000;

describe('timelineViewport', () => {
  describe('panBy', () => {
    it('translates both ends by delta (when span is valid)', () => {
      const v = { startMs: 0, endMs: 30 * DAY };
      expect(panBy(v, 10 * DAY)).toEqual({ startMs: 10 * DAY, endMs: 40 * DAY });
      expect(panBy(v, -5 * DAY)).toEqual({ startMs: -5 * DAY, endMs: 25 * DAY });
    });
  });

  describe('zoomBy', () => {
    it('zoom in halves the span around anchor at center', () => {
      const v = { startMs: 0, endMs: 100 * DAY };
      const z = zoomBy(v, 0.5, 50 * DAY);
      expect(z.endMs - z.startMs).toBe(50 * DAY);
      expect((z.startMs + z.endMs) / 2).toBe(50 * DAY);
    });

    it('zoom out doubles the span', () => {
      const v = { startMs: 0, endMs: 100 * DAY };
      const z = zoomBy(v, 2, 50 * DAY);
      expect(z.endMs - z.startMs).toBe(200 * DAY);
    });
  });

  describe('centerOn', () => {
    it('preserves span and centers on target', () => {
      const v = { startMs: 0, endMs: 100 * DAY };
      const c = centerOn(v, 500 * DAY);
      expect(c.endMs - c.startMs).toBe(100 * DAY);
      expect((c.startMs + c.endMs) / 2).toBe(500 * DAY);
    });
  });

  describe('clampSpan', () => {
    it('enforces minimum span', () => {
      const c = clampSpan(0, 100); // tiny
      expect(c.endMs - c.startMs).toBe(MIN_SPAN_MS);
    });
    it('enforces maximum span', () => {
      const c = clampSpan(0, MAX_SPAN_MS * 10);
      expect(c.endMs - c.startMs).toBe(MAX_SPAN_MS);
    });
  });

  describe('fitToData', () => {
    it('returns null for empty input', () => {
      expect(fitToData([], [])).toBeNull();
    });
    it('pads min..max by 5%', () => {
      const fit = fitToData([100 * DAY], [200 * DAY]);
      expect(fit).not.toBeNull();
      expect(fit!.startMs).toBeLessThan(100 * DAY);
      expect(fit!.endMs).toBeGreaterThan(200 * DAY);
    });
    it('handles single-point data', () => {
      const fit = fitToData([500 * DAY], [500 * DAY]);
      expect(fit!.endMs - fit!.startMs).toBeGreaterThanOrEqual(MIN_SPAN_MS);
    });
  });

  describe('stepFor', () => {
    it('picks day for <= 14 days', () => {
      expect(stepFor({ startMs: 0, endMs: 14 * DAY }).unit).toBe('day');
    });
    it('picks week for <= 90 days', () => {
      expect(stepFor({ startMs: 0, endMs: 60 * DAY }).unit).toBe('week');
    });
    it('picks month for <= 2 years', () => {
      expect(stepFor({ startMs: 0, endMs: 365 * DAY }).unit).toBe('month');
    });
    it('picks quarter for longer', () => {
      expect(stepFor({ startMs: 0, endMs: 1500 * DAY }).unit).toBe('quarter');
    });
  });

  describe('defaultViewport', () => {
    it('spans ~67 days centered on now-ish', () => {
      const now = 1_000_000_000_000;
      const v = defaultViewport(now);
      expect(v.endMs - v.startMs).toBe(67 * DAY);
    });
  });

  describe('px<->ms', () => {
    it('round-trips', () => {
      const v = { startMs: 0, endMs: 100 * DAY };
      const w = 400;
      const ms = 50 * DAY;
      const px = pxForMs(v, ms, w);
      expect(msForPx(v, px, w)).toBe(ms);
    });
  });
});
