import { afterEach, describe, expect, it, vi } from 'vitest';
import { LICENCE, rightsExportResponse, toCsv, toJson, toRecord } from './rightsExport';
import type { Env } from './sitemap';

// Shapes copied from production rows (2026-11-18), trimmed.
const NG = {
  code: 'NG',
  name: 'Nigeria',
  slug: 'nigeria',
  equality_score: 5,
  lgbti_data_last_updated: '2026-11-18T02:00:16.635+00:00',
  lgbti_criminalization: {
    legal: false,
    penalty: '10 years to life in prison',
    death_penalty: 'Yes',
    fine: 'Under the Penal Code (Northern States) … fines.',
    other: "Several of Nigeria's Northern states …",
  },
  lgbti_same_sex_unions: '{"summary":"No","marriage":"No","marriage_since":null}',
  lgbti_adoption_rights: 'No adoption possible',
  lgbti_conversion_therapy_regulation: 'Not banned',
  lgbti_gender_recognition: { self_id: 'No', gender_marker: 'Not Possible' },
  lgbti_intersex_protection: 'No',
  lgbti_expression_restrictions: { summary: 'Explicit Legal Barriers' },
  lgbti_association_restrictions: { status: 'Explicit Legal Barriers' },
};
const DE = {
  code: 'DE',
  name: 'Germany',
  slug: 'germany',
  equality_score: 100,
  lgbti_criminalization: { legal: true, penalty: 'No criminalisation', decrim_year_1: 1968 },
  lgbti_same_sex_unions: '{"summary":"Marriage","marriage_since":2017,"civil_union_since":2001}',
  lgbti_gender_recognition: { self_id: 'Yes', self_id_since: 2024, gender_marker: 'Possible' },
  lgbti_employment_protection: { so: 'Yes', gi: 'Yes' },
};

describe('toRecord', () => {
  it('flattens categorical values and years', () => {
    const r = toRecord(DE);
    expect(r).toMatchObject({
      country_code: 'DE',
      page_url: 'https://queer.guide/country/germany',
      same_sex_acts_legal: 'yes',
      decriminalised_year: 1968,
      same_sex_unions: 'Marriage',
      marriage_since: 2017,
      gender_self_id: 'Yes',
      gender_self_id_since: 2024,
      protection_employment_so: 'Yes',
      protection_housing_so: null,
      equality_score: 100,
      equality_tier: 'very-high',
    });
  });

  it("never exports ILGA's free-text prose", () => {
    const flat = JSON.stringify(toRecord(NG));
    expect(flat).not.toContain('Penal Code');
    expect(flat).not.toContain('Northern states');
  });

  it('keeps an unscored country unscored rather than defaulting', () => {
    const r = toRecord({
      code: 'AQ',
      name: 'Antarctica',
      slug: 'antarctica',
      equality_score: null,
    });
    expect(r.equality_score).toBeNull();
    expect(r.equality_tier).toBeNull();
    expect(r.same_sex_acts_legal).toBeNull();
  });

  it('every row names both sources and the split of terms', () => {
    expect(toRecord(NG).source).toContain('ILGA World Database');
    expect(toRecord(NG).source).toContain('CC BY-SA 4.0');
  });
});

describe('toCsv', () => {
  it('has one header row, one row per country, and stable columns', () => {
    const csv = toCsv([toRecord(DE), toRecord(NG)]);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].split(',')[0]).toBe('country_code');
    expect(lines.every((l) => l.length > 0)).toBe(true);
  });

  it('quotes commas and quotes, and defuses spreadsheet formulas', () => {
    const csv = toCsv([{ a: 'x, "y"', b: '=HYPERLINK("evil")', c: '-1', d: null }]);
    const row = csv.split('\r\n')[1];
    expect(row).toBe(`"x, ""y""","'=HYPERLINK(""evil"")",'-1,`);
  });
});

describe('toJson', () => {
  it('scopes the Queer Guide licence to our columns only', () => {
    const doc = JSON.parse(toJson([toRecord(DE)], '2026-11-18T00:00:00Z'));
    expect(doc.licence.queer_guide_licence).toBe('CC BY-SA 4.0');
    expect(doc.licence.queer_guide_columns).toEqual(['equality_score', 'equality_tier']);
    expect(doc.licence.note).toContain('not covered by the Queer Guide licence');
    expect(doc).not.toHaveProperty('license');
    expect(doc.source.name).toBe(LICENCE.sourceName);
    expect(doc.countries).toHaveLength(1);
  });
});

describe('rightsExportResponse', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } as unknown as Env;

  it('serves 503, not an empty file, when no rows come back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]')),
    );
    const res = await rightsExportResponse(env, 'csv');
    expect(res.status).toBe(503);
  });

  it('serves a CSV attachment with open CORS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify([DE, NG]), { headers: { 'Content-Range': '0-1/2' } }),
      ),
    );
    const res = await rightsExportResponse(env, 'csv');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect((await res.text()).split('\r\n').filter(Boolean)).toHaveLength(3);
  });
  it.each([null, '0-1/*', '0-1/3', '1-2/3', '0-2/2'])(
    'refuses unverified or partial exports (%s)',
    async (range) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify([DE, NG]), {
              headers: range ? { 'Content-Range': range } : {},
            }),
        ),
      );
      const res = await rightsExportResponse(env, 'json');
      expect(res.status).toBe(503);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    },
  );

  it('uses only anonymous credentials even when an admin key is available', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify([DE, NG]), { headers: { 'Content-Range': '0-1/2' } }),
    );
    vi.stubGlobal('fetch', fetch);
    expect(
      (await rightsExportResponse({ ...env, SUPABASE_SERVICE_ROLE_KEY: 'admin-fixture' }, 'json'))
        .status,
    ).toBe(200);
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      apikey: 'k',
      Authorization: 'Bearer k',
      Prefer: 'count=exact',
    });
  });

  it('returns retryable unavailable data when the upstream request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unavailable');
      }),
    );
    const res = await rightsExportResponse(env, 'csv');
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('300');
  });

  it('bounds a stalled upstream request', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof globalThis.fetch>(
          (_url, options) =>
            new Promise<Response>((_resolve, reject) => {
              options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
                once: true,
              });
            }),
        ),
      );
      const pending = rightsExportResponse(env, 'csv');
      await vi.advanceTimersByTimeAsync(3000);
      expect((await pending).status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });
});
