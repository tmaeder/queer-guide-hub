import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WHEN_STORAGE_KEY,
  parseWhen,
  readWhen,
  serializeWhen,
  whenRange,
  writeWhen,
} from '../whenSelection';
import { sortHighlights } from '@/hooks/useIntentData';

describe('parseWhen / serializeWhen', () => {
  it('round-trips presets and days through the URL form', () => {
    for (const raw of ['tonight', 'weekend', '7d', '2026-12-05']) {
      expect(serializeWhen(parseWhen(raw))).toBe(raw);
    }
  });

  it('rejects junk', () => {
    expect(parseWhen('soon')).toBeNull();
    expect(parseWhen('2026-13-99')).toBeNull();
    expect(parseWhen(null)).toBeNull();
  });
});

describe('whenRange', () => {
  it('runs a picked day from midnight to 06:00 the next morning', () => {
    const now = new Date('2026-12-01T10:00:00');
    const r = whenRange({ day: '2026-12-05' }, now);
    expect(r.start.getDate()).toBe(5);
    expect(r.start.getHours()).toBe(0);
    expect(r.end.getDate()).toBe(6);
    expect(r.end.getHours()).toBe(6);
  });

  it('never starts in the past', () => {
    const now = new Date('2026-12-05T21:30:00');
    expect(whenRange({ day: '2026-12-05' }, now).start).toEqual(now);
  });
});

describe('session storage', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('stores and reads a choice', () => {
    writeWhen('this-weekend');
    expect(readWhen()).toBe('this-weekend');
    writeWhen(null);
    expect(readWhen()).toBeNull();
  });

  it('drops a day that has passed', () => {
    sessionStorage.setItem(WHEN_STORAGE_KEY, JSON.stringify({ v: '2020-01-01', ts: Date.now() }));
    expect(readWhen()).toBeNull();
  });

  it('expires after 12 hours', () => {
    writeWhen('tonight');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 13 * 3_600_000);
    expect(readWhen()).toBeNull();
  });
});

describe('sortHighlights', () => {
  it('puts own city, then own country, then the rest, keeping date order', () => {
    const rows = [
      { id: 'far1', city_id: 'x', country_id: 'X' },
      { id: 'country', city_id: 'y', country_id: 'CH' },
      { id: 'home', city_id: 'zh', country_id: 'CH' },
      { id: 'far2', city_id: 'z', country_id: 'Z' },
    ];
    expect(sortHighlights(rows, 'zh', 'CH').map((r) => r.id)).toEqual([
      'home',
      'country',
      'far1',
      'far2',
    ]);
  });
});
