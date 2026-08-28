import { describe, it, expect } from 'vitest';
import {
  groupProgramme,
  hasProgramme,
  laneSpan,
  byDay,
  type ProgrammeChild,
} from '../prideProgramme';

function child(over: Partial<ProgrammeChild> & { id: string; start_date: string }): ProgrammeChild {
  return {
    slug: over.id,
    title: over.id,
    ...over,
  } as ProgrammeChild;
}

describe('groupProgramme', () => {
  it('routes parade, festival and week by subtype', () => {
    const lanes = groupProgramme([
      child({ id: 'parade', start_date: '2026-07-05T11:00:00Z', pride_subtypes: ['parade'] }),
      child({ id: 'fest', start_date: '2026-07-03T12:00:00Z', pride_subtypes: ['festival'] }),
      child({ id: 'talk', start_date: '2026-07-01T18:00:00Z', pride_subtypes: ['community'] }),
    ]);
    expect(lanes.parade.map((c) => c.id)).toEqual(['parade']);
    expect(lanes.festival.map((c) => c.id)).toEqual(['fest']);
    expect(lanes.week.map((c) => c.id)).toEqual(['talk']);
  });

  it('puts a child with no subtype in the week lane rather than dropping it', () => {
    const lanes = groupProgramme([child({ id: 'afterparty', start_date: '2026-07-05T22:00:00Z' })]);
    expect(lanes.week.map((c) => c.id)).toEqual(['afterparty']);
    expect(lanes.parade).toHaveLength(0);
    expect(lanes.festival).toHaveLength(0);
  });

  it('treats a null subtype array like an absent one', () => {
    const lanes = groupProgramme([
      child({ id: 'x', start_date: '2026-07-05T22:00:00Z', pride_subtypes: null }),
    ]);
    expect(lanes.week).toHaveLength(1);
  });

  it('lets a child claim two lanes at once', () => {
    const lanes = groupProgramme([
      child({
        id: 'gala',
        start_date: '2026-07-04T20:00:00Z',
        pride_subtypes: ['festival', 'film'],
      }),
    ]);
    expect(lanes.festival.map((c) => c.id)).toEqual(['gala']);
    // Claiming festival means it is NOT also repeated into week.
    expect(lanes.week).toHaveLength(0);
  });

  it('routes a rally into the parade lane', () => {
    const lanes = groupProgramme([
      child({ id: 'demo', start_date: '2026-07-05T10:00:00Z', pride_subtypes: ['rally'] }),
    ]);
    expect(lanes.parade.map((c) => c.id)).toEqual(['demo']);
  });

  it('sorts each lane chronologically', () => {
    const lanes = groupProgramme([
      child({ id: 'late', start_date: '2026-07-06T20:00:00Z' }),
      child({ id: 'early', start_date: '2026-07-01T20:00:00Z' }),
    ]);
    expect(lanes.week.map((c) => c.id)).toEqual(['early', 'late']);
  });

  it('reports an empty programme', () => {
    expect(hasProgramme(groupProgramme([]))).toBe(false);
  });
});

describe('laneSpan', () => {
  it('spans earliest start to latest end', () => {
    const span = laneSpan([
      child({ id: 'a', start_date: '2026-07-03T10:00:00Z', end_date: '2026-07-04T02:00:00Z' }),
      child({ id: 'b', start_date: '2026-07-05T10:00:00Z' }),
    ]);
    expect(span?.[0].toISOString()).toBe('2026-07-03T10:00:00.000Z');
    expect(span?.[1].toISOString()).toBe('2026-07-05T10:00:00.000Z');
  });

  it('never returns a backwards span when end_date predates start_date', () => {
    const span = laneSpan([
      child({ id: 'broken', start_date: '2026-07-05T10:00:00Z', end_date: '2026-07-01T10:00:00Z' }),
    ]);
    expect(span?.[1].getTime()).toBeGreaterThanOrEqual(span![0].getTime());
  });

  it('returns null for an empty lane', () => {
    expect(laneSpan([])).toBeNull();
  });
});

describe('byDay', () => {
  // Midday timestamps on purpose: byDay buckets by LOCAL calendar day (that is
  // what the page renders), so an evening UTC time lands on a different day
  // depending on the runner's zone and would make this test flap.
  it('groups by calendar day in order', () => {
    const days = byDay([
      child({ id: 'b', start_date: '2026-07-02T12:00:00Z' }),
      child({ id: 'a', start_date: '2026-07-01T12:00:00Z' }),
      child({ id: 'c', start_date: '2026-07-02T13:00:00Z' }),
    ]);
    expect(days).toHaveLength(2);
    expect(days[1][1].map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('skips an unparseable date instead of creating a NaN bucket', () => {
    expect(byDay([child({ id: 'bad', start_date: 'not-a-date' })])).toHaveLength(0);
  });
});
