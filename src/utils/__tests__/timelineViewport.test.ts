import { describe, expect, it } from 'vitest';
import { fitToEvents, SERIES_SPAN_MS } from '../timelineViewport';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 3);

describe('fitToEvents', () => {
  it('returns null with no usable dates', () => {
    expect(fitToEvents([], NOW)).toBeNull();
    expect(fitToEvents([{ startMs: NaN, endMs: NaN }], NOW)).toBeNull();
  });

  // The /events defect: one standing series stored as 2021 → 2027 stretched
  // the window to the five-year cap and pushed every real event off-screen.
  it('does not let a standing series stretch the window', () => {
    const v = fitToEvents(
      [
        { startMs: Date.UTC(2021, 0, 1), endMs: Date.UTC(2027, 11, 31) },
        { startMs: NOW + 3 * DAY, endMs: NOW + 3 * DAY },
        { startMs: NOW + 20 * DAY, endMs: NOW + 22 * DAY },
      ],
      NOW,
    )!;
    expect(v.startMs).toBeGreaterThanOrEqual(NOW - 2 * DAY);
    expect(v.endMs - v.startMs).toBeLessThan(60 * DAY);
  });

  it('opens on today when something is still on', () => {
    const v = fitToEvents([{ startMs: NOW - 400 * DAY, endMs: NOW + 5 * DAY }], NOW)!;
    expect(v.startMs).toBeGreaterThan(NOW - 3 * DAY);
    expect(v.startMs).toBeLessThanOrEqual(NOW);
  });

  it('caps each event at SERIES_SPAN_MS past its start', () => {
    const start = NOW + DAY;
    const v = fitToEvents([{ startMs: start, endMs: start + 900 * DAY }], NOW)!;
    expect(v.endMs).toBeLessThan(start + SERIES_SPAN_MS + 5 * DAY);
  });

  it('keeps past-only listings where they are', () => {
    const a = NOW - 300 * DAY;
    const b = NOW - 200 * DAY;
    const v = fitToEvents(
      [
        { startMs: a, endMs: a },
        { startMs: b, endMs: b },
      ],
      NOW,
    )!;
    expect(v.startMs).toBeLessThan(a);
    expect(v.endMs).toBeGreaterThan(b);
    expect(v.endMs).toBeLessThan(NOW);
  });
});
