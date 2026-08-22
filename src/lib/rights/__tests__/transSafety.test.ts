import { describe, it, expect } from 'vitest';
import {
  readTransViolence,
  readTransRightsIndex,
  summariseRecognition,
  TRI_CATEGORIES,
  GENDER_RECOGNITION_TOPIC,
} from '../transSafety';

/**
 * The failure that matters here is a CONFIDENT WRONG NUMBER shown to a trans
 * person deciding whether a country is safe to enter. Two specific lies are
 * possible and each has its own test below:
 *
 *   - "no cases recorded" rendering as a zero, i.e. as good news;
 *   - a country outside the Trans Rights Index's 54-country scope rendering as
 *     if it had been assessed and scored nothing.
 */

describe('readTransViolence — absence is never a zero', () => {
  it('treats an empty blob as none_recorded with a NULL total, not 0', () => {
    const r = readTransViolence({});
    expect(r.state).toBe('none_recorded');
    // The whole point: `0` would format as "0 cases" and read as a safety claim.
    expect(r.total).toBeNull();
    expect(r.latestCases).toBeNull();
    expect(r.byPeriod).toEqual([]);
  });

  it.each([null, undefined, 'nope', 42, []])('treats %p as none_recorded', (input) => {
    expect(readTransViolence(input).state).toBe('none_recorded');
  });

  it('never reports state=documented with a zero or negative total', () => {
    for (const total of [0, -1, '0']) {
      const r = readTransViolence({ total, by_period: {} });
      expect(r.state).toBe('none_recorded');
      expect(r.total).toBeNull();
    }
  });

  it('keeps our own resolver failure distinguishable from real absence', () => {
    // `unmatched` means we hold NO answer, which is different from TGEU holding
    // no case. Collapsing the two would hide an import regression forever.
    const r = readTransViolence({ unmatched: true });
    expect(r.state).toBe('unmatched');
    expect(r.total).toBeNull();
  });

  it('reads a documented country and orders periods newest first', () => {
    const r = readTransViolence({
      total: 2031,
      by_period: { 'TDoR 2023': 100, 'TDoR 2025': 106, 'TDoR 2024': 96 },
      fetched_at: '2026-09-16T00:00:00Z',
      source_url: 'https://transmurdermonitoring.tgeu.org/',
    });
    expect(r.state).toBe('documented');
    expect(r.total).toBe(2031);
    expect(r.byPeriod.map((p) => p.period)).toEqual(['TDoR 2025', 'TDoR 2024', 'TDoR 2023']);
    expect(r.latestPeriod).toBe('TDoR 2025');
    expect(r.latestCases).toBe(106);
    expect(r.fetchedAt).toBe('2026-09-16T00:00:00Z');
  });

  it('drops zero-case periods rather than charting them as data points', () => {
    const r = readTransViolence({ total: 5, by_period: { 'TDoR 2024': 5, 'TDoR 2025': 0 } });
    expect(r.byPeriod).toEqual([{ period: 'TDoR 2024', cases: 5 }]);
    expect(r.latestPeriod).toBe('TDoR 2024');
  });

  it('falls back to summing periods when total is missing', () => {
    const r = readTransViolence({ by_period: { 'TDoR 2024': 3, 'TDoR 2025': 4 } });
    expect(r.state).toBe('documented');
    expect(r.total).toBe(7);
  });

  it('sorts period labels chronologically across the full 2008-2025 range', () => {
    // Lexicographic order is chronological only because the year suffix is
    // fixed-width. If a label shape ever changes this test is the tripwire.
    const r = readTransViolence({
      by_period: { 'TDoR 2008': 1, 'TDoR 2010': 1, 'TDoR 2009': 1, 'TDoR 2025': 1 },
    });
    expect(r.byPeriod.map((p) => p.period)).toEqual([
      'TDoR 2025',
      'TDoR 2010',
      'TDoR 2009',
      'TDoR 2008',
    ]);
  });
});

describe('readTransRightsIndex — out of scope is not a zero score', () => {
  it('reports covered=false for a country the index does not assess', () => {
    const r = readTransRightsIndex({});
    expect(r.covered).toBe(false);
    expect(r.total).toBeNull();
  });

  it('reports covered=true for a genuine score of zero', () => {
    // A real 0/100 is a finding. It must not collapse into "not assessed".
    const r = readTransRightsIndex({ total: 0, max: 100, source_year: 2026 });
    expect(r.covered).toBe(true);
    expect(r.total).toBe(0);
  });

  it('keeps only the six known categories and ignores unknown keys', () => {
    const r = readTransRightsIndex({
      total: 40,
      max: 100,
      categories: { health: 5, asylum: 3, made_up_category: 99, family: 'x' },
    });
    expect(Object.keys(r.categories).sort()).toEqual(['asylum', 'health']);
    expect(r.categories.health).toBe(5);
  });

  it('exposes exactly the six TGEU categories', () => {
    expect(TRI_CATEGORIES).toHaveLength(6);
  });
});

describe('summariseRecognition — the ledger /rights cannot draw', () => {
  const row = (lgr: Record<string, unknown> | null) => ({
    lgbti_gender_recognition: lgr ?? {},
  });

  it('counts an empty jsonb as UNMEASURED, not as a negative answer', () => {
    const l = summariseRecognition([row(null), row(null)]);
    expect(l.total).toBe(2);
    expect(l.measured).toBe(0);
    expect(l.markerChangePossible).toBe(0);
  });

  it('separates measured from total so a percentage can be honest', () => {
    const l = summariseRecognition([
      row({ gender_marker: 'Possible', self_id: 'Yes' }),
      row(null),
      row({ gender_marker: 'Not possible' }),
    ]);
    expect(l.total).toBe(3);
    expect(l.measured).toBe(2);
    expect(l.markerChangePossible).toBe(1);
    expect(l.selfId).toBe(1);
  });

  it('counts surgery and diagnosis requirements as harms', () => {
    const l = summariseRecognition([
      row({ gender_marker: 'Possible', requires_surgery: 'Yes', requires_diagnosis: 'Yes' }),
      row({ gender_marker: 'Possible', requires_surgery: 'No', requires_diagnosis: 'No' }),
    ]);
    expect(l.requiresSurgery).toBe(1);
    expect(l.requiresDiagnosis).toBe(1);
    // Both countries allow a marker change; only one demands sterilisation.
    // Collapsing this into one "recognition" bar is exactly what /rights
    // refuses to do, and why UNCOUNTED_SLUGS exists.
    expect(l.markerChangePossible).toBe(2);
  });

  it('does not treat "No data" as a marker change being possible', () => {
    const l = summariseRecognition([row({ gender_marker: 'No data' })]);
    expect(l.measured).toBe(1);
    expect(l.markerChangePossible).toBe(0);
  });

  it('reuses the shared catalog entry rather than redefining the topic', () => {
    expect(GENDER_RECOGNITION_TOPIC.slug).toBe('gender-recognition');
    expect(GENDER_RECOGNITION_TOPIC.column).toBe('lgbti_gender_recognition');
  });
});
