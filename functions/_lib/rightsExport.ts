/**
 * Bulk download of LGBTQ+ legal status by country: /data/rights-by-country.csv
 * and .json.
 *
 * Two kinds of data in one file, under different terms, and the file says so:
 *  - The legal-status columns are taken from the ILGA World Database, which is
 *    "© Copyright" with no open licence (checked 2026-11-18). They stay ILGA's.
 *    Only categorical values and years are exported, never ILGA's free-text
 *    prose (`fine`, `other`, …), which is the most clearly authored part.
 *  - The equality score and tier are Queer Guide's, licensed CC BY-SA 4.0.
 * Do not add a blanket `license` that covers the whole file: it would be a
 * false statement about ILGA's columns.
 */
import type { Env } from './sitemap';
import { SITE_ORIGIN } from './routeMeta';
import { tierForScore } from '../../src/utils/equalityScore';

type Json = Record<string, unknown> | null | undefined;
type CountryRow = Record<string, unknown>;

export const LICENCE = {
  ourColumns: ['equality_score', 'equality_tier'],
  ourLicence: 'CC BY-SA 4.0',
  ourLicenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sourceName: 'ILGA World Database',
  sourceUrl: 'https://database.ilga.org/',
  attribution:
    'Legal status data: ILGA World Database (© ILGA World), not covered by the Queer Guide licence. Equality score and tier: Queer Guide, CC BY-SA 4.0, https://queer.guide/tags/rights-by-country/methodology',
};

const SOURCE_NOTE =
  'Legal status: ILGA World Database (© ILGA World). Score and tier: Queer Guide, CC BY-SA 4.0.';

const PROTECTION_AREAS = [
  'constitutional',
  'employment',
  'housing',
  'education',
  'health',
  'goods_services',
  'bullying',
] as const;

const SELECT = [
  'code',
  'name',
  'slug',
  'equality_score',
  'lgbti_data_last_updated',
  'lgbti_criminalization',
  'lgbti_same_sex_unions',
  'lgbti_adoption_rights',
  'lgbti_conversion_therapy_regulation',
  'lgbti_gender_recognition',
  'lgbti_intersex_protection',
  'lgbti_hate_crime_law',
  'lgbti_incitement_prohibition',
  'lgbti_expression_restrictions',
  'lgbti_association_restrictions',
  ...PROTECTION_AREAS.map((a) => `lgbti_${a}_protection`),
].join(',');

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** `lgbti_same_sex_unions` is stored as a JSON string; tolerate plain text. */
function unions(v: unknown): Record<string, unknown> {
  if (typeof v !== 'string') return obj(v);
  try {
    return obj(JSON.parse(v));
  } catch {
    return { summary: v };
  }
}

const val = (v: unknown): string | number | null =>
  typeof v === 'string' || typeof v === 'number' ? v : null;

export type RightsRecord = Record<string, string | number | null>;

/** One flat row per country. Column order here is the CSV column order. */
export function toRecord(row: CountryRow): RightsRecord {
  const crim = obj(row.lgbti_criminalization as Json);
  const ssu = unions(row.lgbti_same_sex_unions);
  const gr = obj(row.lgbti_gender_recognition as Json);
  const score = typeof row.equality_score === 'number' ? row.equality_score : null;
  const rec: RightsRecord = {
    country_code: val(row.code),
    country_name: val(row.name),
    page_url: row.slug ? `${SITE_ORIGIN}/country/${row.slug}` : null,
    same_sex_acts_legal: crim.legal === true ? 'yes' : crim.legal === false ? 'no' : null,
    penalty: val(crim.penalty),
    death_penalty: val(crim.death_penalty),
    decriminalised_year: val(crim.decrim_year_1),
    same_sex_unions: val(ssu.summary),
    marriage_since: val(ssu.marriage_since),
    civil_union_since: val(ssu.civil_union_since),
    adoption: val(row.lgbti_adoption_rights),
    conversion_practices: val(row.lgbti_conversion_therapy_regulation),
    gender_self_id: val(gr.self_id),
    gender_self_id_since: val(gr.self_id_since),
    gender_marker_change: val(gr.gender_marker),
    gender_change_requires_surgery: val(gr.requires_surgery),
    gender_change_requires_diagnosis: val(gr.requires_diagnosis),
    intersex_protection: val(row.lgbti_intersex_protection),
    hate_crime_law_so: val(obj(row.lgbti_hate_crime_law as Json).so),
    hate_crime_law_gi: val(obj(row.lgbti_hate_crime_law as Json).gi),
    incitement_prohibition_so: val(obj(row.lgbti_incitement_prohibition as Json).so),
    incitement_prohibition_gi: val(obj(row.lgbti_incitement_prohibition as Json).gi),
  };
  for (const area of PROTECTION_AREAS) {
    const p = obj(row[`lgbti_${area}_protection`] as Json);
    rec[`protection_${area}_so`] = val(p.so);
    rec[`protection_${area}_gi`] = val(p.gi);
  }
  rec.expression_restrictions = val(obj(row.lgbti_expression_restrictions as Json).summary);
  rec.association_restrictions = val(obj(row.lgbti_association_restrictions as Json).status);
  rec.ilga_last_updated =
    typeof row.lgbti_data_last_updated === 'string'
      ? row.lgbti_data_last_updated.slice(0, 10)
      : null;
  rec.equality_score = score;
  rec.equality_tier = score == null ? null : tierForScore(score);
  // In every row because a CSV travels without the page it came from.
  rec.source = SOURCE_NOTE;
  return rec;
}

/** RFC 4180 quoting, plus a guard against spreadsheet formula injection. */
function csvCell(v: string | number | null): string {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(records: RightsRecord[]): string {
  if (records.length === 0) return '';
  const cols = Object.keys(records[0]);
  const lines = [cols.join(','), ...records.map((r) => cols.map((c) => csvCell(r[c])).join(','))];
  return lines.join('\r\n') + '\r\n';
}

export function toJson(records: RightsRecord[], generatedAt: string): string {
  return JSON.stringify(
    {
      title: 'LGBTQ+ legal status by country',
      source: { name: LICENCE.sourceName, url: LICENCE.sourceUrl },
      licence: {
        note: LICENCE.attribution,
        queer_guide_columns: LICENCE.ourColumns,
        queer_guide_licence: LICENCE.ourLicence,
        queer_guide_licence_url: LICENCE.ourLicenceUrl,
      },
      methodology: `${SITE_ORIGIN}/tags/rights-by-country/methodology`,
      generated_at: generatedAt,
      countries: records,
    },
    null,
    2,
  );
}

export type ExportFormat = 'csv' | 'json';

/** Public exports must contain the complete public result, never a sitemap's partial read. */
async function fetchCountries(env: Env): Promise<CountryRow[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const query = new URLSearchParams({ select: SELECT, order: 'name.asc', limit: '1000' });
    const response = await fetch(
      `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/countries?${query}`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          Accept: 'application/json',
          Prefer: 'count=exact',
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) return [];
    const rows: unknown = await response.json();
    const range = response.headers.get('Content-Range')?.match(/^0-(\d+)\/(\d+)$/);
    if (
      !Array.isArray(rows) ||
      !range ||
      rows.length === 0 ||
      Number(range[1]) + 1 !== rows.length ||
      Number(range[2]) !== rows.length
    )
      return [];
    return rows as CountryRow[];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function rightsExportResponse(env: Env, format: ExportFormat): Promise<Response> {
  const rows = await fetchCountries(env);
  if (rows.length === 0) {
    // Never serve an empty file as if it were the dataset.
    return new Response('Rights data is temporarily unavailable.', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': '300',
        'Cache-Control': 'no-store',
      },
    });
  }
  const records = rows.map((r) => toRecord(r as CountryRow));
  const body = format === 'csv' ? toCsv(records) : toJson(records, new Date().toISOString());
  const headers: Record<string, string> = {
    'Content-Type':
      format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
    // Data changes nightly; an hour at the edge keeps repeat downloads cheap.
    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    'Access-Control-Allow-Origin': '*',
  };
  if (format === 'csv') {
    headers['Content-Disposition'] = 'attachment; filename="queer-guide-rights-by-country.csv"';
  }
  return new Response(body, { headers });
}
