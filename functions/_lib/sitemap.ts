/**
 * Shared helpers for the dynamic sitemap functions.
 * Pulls slugs from Supabase via PostgREST. NOTE: `fetchRows` PREFERS the
 * service-role key when present (see below), which BYPASSES RLS — it only
 * falls back to the anon key. So row-level visibility rules (e.g. the safety
 * layer's `safety_gated` gate) are NOT enforced automatically here; callers
 * that read gated tables (venues/events) must add an explicit
 * `safety_gated=eq.false` filter.
 */
import { SITE_ORIGIN } from './routeMeta';

export type Env = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ASSETS: { fetch: typeof fetch };
};

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
};

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function urlsetXml(entries: SitemapEntry[]): string {
  const body = entries
    .map((e) => {
      const parts = [`<loc>${xmlEscape(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`<lastmod>${e.lastmod}</lastmod>`);
      if (e.changefreq) parts.push(`<changefreq>${e.changefreq}</changefreq>`);
      if (e.priority !== undefined) parts.push(`<priority>${e.priority.toFixed(1)}</priority>`);
      return `  <url>${parts.join('')}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function indexXml(sitemaps: { loc: string; lastmod?: string }[]): string {
  const body = sitemaps
    .map((s) => {
      const parts = [`<loc>${xmlEscape(s.loc)}</loc>`];
      if (s.lastmod) parts.push(`<lastmod>${s.lastmod}</lastmod>`);
      return `  <sitemap>${parts.join('')}</sitemap>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export function xmlResponse(xml: string, maxAgeSeconds = 3600): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}`,
    },
  });
}

type Row = Record<string, unknown>;

/**
 * PostgREST's server-side `db-max-rows` setting on this project. Asking for
 * more than this in a single request does NOT error and does NOT set any
 * "truncated" header — `res.ok` is true and a short array comes back. Passing
 * `limit=5000` therefore returned at most 1000 rows, and every sitemap was
 * silently capped at 1000 URLs while tens of thousands of pages went
 * unannounced to Google (measured 2026-08-02: sitemap-personalities.xml held
 * exactly 1000 <loc> entries — "exactly 1000" is the tell).
 *
 * Keep this in sync with the server's db-max-rows. If the server value is ever
 * LOWERED below this, pagination still terminates correctly (a short page ends
 * the loop) but would stop early — the ceiling warning below is what makes
 * that visible instead of silent.
 */
const PAGE_SIZE = 1000;

/**
 * Google's per-sitemap limit is 50,000 URLs / 50 MB uncompressed. We refuse to
 * page past it: a sitemap over the limit is rejected wholesale by Search
 * Console, so silently building one is worse than stopping short and saying so.
 * When a type approaches this, split it into a sitemap index (see sitemap.xml).
 */
export const SITEMAP_MAX_URLS = 50_000;

/**
 * Fetch every row matching `filter`, paging past PostgREST's db-max-rows cap.
 *
 * `order` is load-bearing, not cosmetic: PostgreSQL gives no row-order
 * guarantee across separate LIMIT/OFFSET queries, so paging an unordered
 * relation can repeat and skip rows. Every table read here has an `id`.
 *
 * NOTE: prefers the service-role key, which BYPASSES RLS — see the file header.
 * Visibility/safety filters must be explicit in `filter`.
 */
export async function fetchRows(
  env: Env,
  table: string,
  select: string,
  filter = '',
  maxRows = SITEMAP_MAX_URLS,
  order = 'id.asc',
): Promise<Row[]> {
  if (!env.SUPABASE_URL) return [];
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY;
  if (!key) return [];
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}`;
  const rows: Row[] = [];

  for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
    const pageSize = Math.min(PAGE_SIZE, maxRows - offset);
    const qs = new URLSearchParams({ select });
    if (filter) {
      for (const part of filter.split('&')) {
        const [k, v] = part.split('=');
        if (k && v !== undefined) qs.append(k, v);
      }
    }
    qs.set('order', order);
    qs.set('limit', String(pageSize));
    qs.set('offset', String(offset));

    const res = await fetch(`${base}?${qs.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      // Partial data beats no data for a sitemap, but never hide the failure.
      console.warn(`[sitemap] ${table} page at offset ${offset} failed: ${res.status}; returning ${rows.length} rows`);
      return rows;
    }
    const page = (await res.json()) as Row[];
    rows.push(...page);
    // A short page means we reached the end of the result set.
    if (page.length < pageSize) return rows;
  }

  if (maxRows >= SITEMAP_MAX_URLS) {
    // The global ceiling. Reaching it means this type has outgrown a single
    // sitemap and is now being silently cut — the exact failure this function
    // exists to prevent. Loud on purpose.
    console.warn(
      `[sitemap] ${table} hit the ${maxRows}-row ceiling — output is TRUNCATED. ` +
        `Split this type into a sitemap index (Google's cap is ${SITEMAP_MAX_URLS} URLs / 50 MB per sitemap).`,
    );
  } else {
    // A caller-supplied cap is a deliberate editorial bound (see
    // sitemap-landings.xml). Record it, but don't cry wolf every run — a
    // warning that always fires is a warning nobody reads.
    console.log(`[sitemap] ${table} stopped at its caller-supplied ${maxRows}-row cap (deliberate bound).`);
  }
  return rows;
}

export const ORIGIN = SITE_ORIGIN;
