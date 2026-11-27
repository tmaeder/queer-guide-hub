import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  facetOptions,
  nextObservanceWithin,
  observanceMarkers,
  observanceDatesText,
} from '@/lib/observanceView';
import { parseFilterState, serializeFilterState, hasAnyFilter } from '@/utils/eventsQueryString';
import type { ObservanceIndexRow } from '@/hooks/useObservanceIndex';
import { isDetailPath, observanceDateLabel } from '../../../functions/_lib/detail';

const row = (slug: string, starts: string, extra: Partial<ObservanceIndexRow> = {}) =>
  ({
    id: slug,
    slug,
    name: slug,
    kind: 'day',
    tone: 'awareness',
    summary: '',
    dates: [{ country_id: null, country_name: null, starts, ends: starts }],
    starts,
    linked_count: 0,
    ...extra,
  }) as ObservanceIndexRow;

describe('homepage next observance', () => {
  const rows = [row('world-aids-day', '2026-12-01'), row('lgbt-history-month', '2027-02-01')];

  it('picks the soonest one within 14 days', () => {
    expect(nextObservanceWithin(rows, '2026-11-22')?.slug).toBe('world-aids-day');
  });
  it('shows nothing when none is within 14 days', () => {
    expect(nextObservanceWithin(rows, '2026-11-01')).toBeNull();
  });
  it('keeps one that already started (index returns the current occurrence)', () => {
    expect(nextObservanceWithin(rows, '2026-12-02')?.slug).toBe('world-aids-day');
  });
});

describe('/events observance facet', () => {
  const rows = [row('a', '2026-12-01'), row('b', '2027-05-17')];
  it('offers only observances starting within 60 days', () => {
    expect(facetOptions(rows, '', '2026-11-22').map((r) => r.slug)).toEqual(['a']);
  });
  it('keeps a selected observance outside the window so it can be cleared', () => {
    expect(facetOptions(rows, 'b', '2026-11-22').map((r) => r.slug)).toEqual(['a', 'b']);
  });
  it('round-trips through the URL and counts as a filter', () => {
    const s = parseFilterState(new URLSearchParams('observance=world-aids-day'));
    expect(s.observance).toBe('world-aids-day');
    expect(hasAnyFilter(s)).toBe(true);
    expect(serializeFilterState(s).get('observance')).toBe('world-aids-day');
    expect(serializeFilterState(parseFilterState(new URLSearchParams())).has('observance')).toBe(
      false,
    );
  });
});

describe('hub map markers', () => {
  it('drops events without coordinates and links the rest', () => {
    const m = observanceMarkers([
      {
        id: '1',
        title: 'Vigil',
        slug: 'vigil',
        latitude: 52.5,
        longitude: 13.4,
        city: 'Berlin',
        start_date: '2026-12-01T18:00:00Z',
      },
      {
        id: '2',
        title: 'No pin',
        slug: 'x',
        latitude: null,
        longitude: null,
        city: null,
        start_date: null,
      },
    ]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      lat: 52.5,
      lng: 13.4,
      linkTo: '/events/vigil',
      subtitle: 'Berlin · 2026-12-01',
    });
  });
});

describe('/days index dates', () => {
  it('lists regional rules by country, months without a day', () => {
    const r = row('lgbt-history-month', '2027-02-01', {
      kind: 'month',
      dates: [
        {
          country_id: 'gb',
          country_name: 'United Kingdom',
          starts: '2027-02-01',
          ends: '2027-02-28',
        },
        {
          country_id: 'us',
          country_name: 'United States',
          starts: '2027-10-01',
          ends: '2027-10-31',
        },
      ],
    });
    expect(observanceDatesText(r, 'en')).toBe('United Kingdom: February · United States: October');
  });
});

describe('crawler', () => {
  it('treats /days/:slug as a detail path and leaves /days to the SPA', () => {
    expect(isDetailPath('/days/world-aids-day')).toBe(true);
    expect(isDetailPath('/days')).toBe(false);
  });
  it('formats single days and spans', () => {
    expect(observanceDateLabel('2026-12-01', '2026-12-01')).toBe('1 December 2026');
    expect(observanceDateLabel('2027-02-01', '2027-02-28')).toBe(
      '1 February 2027 – 28 February 2027',
    );
  });
  it('excludes safety-gated and unpublished rows in the query (service role bypasses RLS)', () => {
    const src = readFileSync(join(process.cwd(), 'functions/_lib/detail.ts'), 'utf8');
    const body = src.slice(
      src.indexOf('async function observanceDetail('),
      src.indexOf('// Festival brands (/festivals/:slug)'),
    );
    expect(body).toMatch(/&status=eq\.published`/);
    expect(body).toMatch(/events\.safety_gated=eq\.false/);
    expect(body).toMatch(/status=eq\.linked/);
  });
  it('the sitemap lists published observances only', () => {
    const src = readFileSync(join(process.cwd(), 'functions/sitemap-days.xml.ts'), 'utf8');
    expect(src).toMatch(
      /fetchRows\(env, 'observances', 'slug,updated_at', 'status=eq\.published'\)/,
    );
  });
});

describe('index + past-years RPCs', () => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const f = readdirSync(dir).find((n) => n.endsWith('_observance_index_and_past_years.sql'))!;
  const sql = readFileSync(join(dir, f), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
  it('both run under the reader RLS (security invoker), never definer', () => {
    expect(sql.match(/security invoker/g)).toHaveLength(2);
    expect(sql).not.toMatch(/security definer/);
  });
  it('count linked, non-duplicate events only', () => {
    expect(sql.match(/eo\.status = 'linked'/g)).toHaveLength(2);
    expect(sql.match(/e\.duplicate_of_id is null/g)).toHaveLength(2);
  });
});
