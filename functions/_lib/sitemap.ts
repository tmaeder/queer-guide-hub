/**
 * Shared helpers for the dynamic sitemap functions.
 * Pulls slugs from Supabase via PostgREST. Uses anon key (RLS-respecting).
 */
import { SITE_ORIGIN } from './routeMeta';

export type Env = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
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

export async function fetchRows(
  env: Env,
  table: string,
  select: string,
  filter = '',
  limit = 5000,
): Promise<Row[]> {
  if (!env.SUPABASE_URL) return [];
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({ select });
  if (filter) {
    for (const part of filter.split('&')) {
      const [k, v] = part.split('=');
      if (k && v !== undefined) qs.append(k, v);
    }
  }
  qs.set('limit', String(limit));
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return [];
  return (await res.json()) as Row[];
}

export const ORIGIN = SITE_ORIGIN;
