import { describe, it, expect } from 'vitest';
import {
  summariseRightsWorldwide,
  valueForTopic,
  UNCOUNTED_SLUGS,
} from '../rightsWorldSummary';
import { RIGHT_TOPICS, topicBySlug } from '../rightsCatalog';

/**
 * These are legal counts shown to people deciding whether a place is safe, so
 * the failure that matters is a CONFIDENT WRONG NUMBER, not a crash. Each test
 * below targets a way this could silently under- or over-report.
 */

const crim = (legal: boolean | null) => ({
  lgbti_criminalization: legal === null ? {} : { legal },
});
const ssu = (marriage: string | null, civilUnion: string | null) => ({
  lgbti_same_sex_unions: JSON.stringify({
    summary: 'x',
    marriage,
    civil_union: civilUnion,
  }),
});

describe('valueForTopic — the three bespoke columns', () => {
  it('reads criminalisation from .legal, not the jsonb object', () => {
    const topic = topicBySlug('criminalisation')!;
    expect(valueForTopic(crim(false), topic)).toBe(false);
    expect(valueForTopic(crim(true), topic)).toBe(true);
  });

  it('leaves criminalisation UNMEASURED when .legal is absent', () => {
    // The dangerous default. Absent must not read as "legal".
    const topic = topicBySlug('criminalisation')!;
    expect(valueForTopic(crim(null), topic)).toBeNull();
    expect(valueForTopic({}, topic)).toBeNull();
  });

  it('splits marriage and civil union out of the same column', () => {
    const row = ssu('Yes', 'No');
    expect(valueForTopic(row, topicBySlug('marriage')!)).toBe('Yes');
    expect(valueForTopic(row, topicBySlug('civil-union')!)).toBe('No');
  });
});

describe('summariseRightsWorldwide', () => {
  it('counts criminalisation both ways without conflating unmeasured rows', () => {
    const rows = [crim(false), crim(false), crim(true), crim(null)];
    const s = summariseRightsWorldwide(rows).find((r) => r.topic.slug === 'criminalisation')!;
    expect(s.no).toBe(2); // severeNegative still buckets as "no"
    expect(s.yes).toBe(1);
    expect(s.measured).toBe(3); // the null row is absent, NOT a zero
  });

  it('never counts gender-recognition, and says so rather than hiding it', () => {
    // Its column shape is not established; a guess would be a confident wrong
    // number about trans legal recognition specifically.
    const s = summariseRightsWorldwide([crim(true)]).find(
      (r) => r.topic.slug === 'gender-recognition',
    )!;
    expect(s.uncounted).toBe(true);
    expect(s.measured).toBe(0);
    expect(UNCOUNTED_SLUGS.has('gender-recognition')).toBe(true);
  });

  it('returns every catalogued right, so none can silently vanish', () => {
    const s = summariseRightsWorldwide([]);
    expect(s).toHaveLength(RIGHT_TOPICS.length);
    expect(new Set(s.map((r) => r.topic.slug)).size).toBe(RIGHT_TOPICS.length);
  });

  it('reports zero measured for an empty corpus rather than throwing', () => {
    for (const r of summariseRightsWorldwide([])) {
      expect(r.measured).toBe(0);
    }
  });

  it('does not treat a missing column as a negative', () => {
    // A row with no rights columns at all must contribute to nothing. If this
    // regresses, every uncovered country reads as "no protection" and the page
    // overstates how hostile the world is.
    const s = summariseRightsWorldwide([{}, {}, {}]);
    for (const r of s) expect(r.measured).toBe(0);
  });
});

describe('protection-matrix rights (9 of 18) — the bug the scalar tests missed', () => {
  const matrix = RIGHT_TOPICS.find((t) => t.kind === 'protection-matrix')!;
  const row = (v: Record<string, string>) => ({ [matrix.column]: v });

  it('does not bucket every country as "no" when the column is a jsonb matrix', () => {
    // The regression: passing the object to readRightValue rendered
    // "0 of 250 countries protect" for employment, housing, health and six more.
    const rows = [row({ so: 'Yes', gi: 'Yes', ge: 'Yes', sc: 'Yes' })];
    const s = summariseRightsWorldwide(rows).find((r) => r.topic.slug === matrix.slug)!;
    expect(s.yes).toBe(1);
    expect(s.no).toBe(0);
  });

  it('requires ALL declared attributes, so partial protection is not "protects"', () => {
    // Counting "any attribute" would let a country protecting sexual
    // orientation but not gender identity count as protecting trans people.
    const rows = [row({ so: 'Yes', gi: 'No', ge: 'No', sc: 'No' })];
    const s = summariseRightsWorldwide(rows).find((r) => r.topic.slug === matrix.slug)!;
    expect(s.yes).toBe(0);
    expect(s.partial).toBe(1);
  });

  it('treats "No data" as absence, not as a negative', () => {
    const rows = [row({ so: 'No data', gi: 'No data', ge: 'No data', sc: 'No data' })];
    const s = summariseRightsWorldwide(rows).find((r) => r.topic.slug === matrix.slug)!;
    expect(s.measured).toBe(0);
    expect(s.no).toBe(0);
  });
});
