/**
 * Crawler head + body for /help/:cc (e.g. /help/de).
 *
 * The SPA serves a per-country hotline list at these URLs, but the edge had no
 * entry for them, so crawlers got the homepage title and an empty body and no
 * /help/* URL was in any sitemap — a resource page linking to "crisis lines in
 * Germany" landed on what looked like the homepage. Data is the same CMS row
 * the page reads (cms_pages.slug = 'help', body_json.hotlines).
 *
 * The bot list is a subset of what people see: rows flagged needs_review are
 * left out, and a website link only appears when the page would show it.
 */
import { fetchRows, ORIGIN, type Env } from './sitemap';
import type { DetailResult } from './detail';
import { STATIC_ROUTE_META } from './routeMeta';

export const HELP_COUNTRY_RE = /^\/help\/([a-z]{2,3})\/?$/i;

export type HelpHotline = {
  name?: string;
  country?: string;
  phone?: string | null;
  hours?: string;
  url?: string;
  link_status?: string;
  needs_review?: boolean;
};

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function countryName(code: string): string {
  if (code === 'INT') return 'worldwide';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Codes that have at least one publishable line — the pages worth indexing. */
export function helpCountryCodes(hotlines: HelpHotline[]): string[] {
  const codes = new Set<string>();
  for (const h of hotlines) if (h.country && !h.needs_review) codes.add(h.country.toUpperCase());
  return [...codes].sort();
}

export async function fetchHelpHotlines(env: Env): Promise<HelpHotline[]> {
  const rows = await fetchRows(
    env,
    'cms_pages',
    'body_json',
    'slug=eq.help&workflow_state=eq.published&visibility_level=eq.public',
    1,
  );
  const list = (rows[0]?.body_json as { hotlines?: unknown } | undefined)?.hotlines;
  return Array.isArray(list) ? (list as HelpHotline[]) : [];
}

export function buildHelpCountry(code: string, hotlines: HelpHotline[]): DetailResult {
  const cc = code.toUpperCase();
  const lines = hotlines.filter((h) => h.country?.toUpperCase() === cc && !h.needs_review);
  const generic = STATIC_ROUTE_META['/help'];

  // Unknown or empty code: the SPA falls back to the reader's own country, so
  // this URL has no content of its own. Serve the /help head and keep it out
  // of the index instead of publishing a duplicate of /help.
  if (lines.length === 0) {
    return {
      meta: generic,
      body: `<main data-prerendered="bot-ua"><article><h1>LGBTQ+ help hotlines and crisis support</h1><p><a href="/help">All crisis lines by country</a></p></article></main>`,
      jsonLd: '',
      indexable: false,
    };
  }

  const place = countryName(cc);
  const where = cc === 'INT' ? place : `in ${place}`;
  const title = `LGBTQ+ crisis lines ${where} | Queer Guide`;
  const items = lines
    .map((h) => {
      const name = escape(h.name ?? '');
      const site =
        h.url && h.link_status !== 'broken' ? ` — <a href="${escape(h.url)}">website</a>` : '';
      const phone = h.phone ? ` — ${escape(h.phone)}` : '';
      const hours = h.hours ? ` (${escape(h.hours)})` : '';
      return `<li>${name}${phone}${hours}${site}</li>`;
    })
    .join('\n        ');

  return {
    meta: {
      title: title.length > 60 ? `LGBTQ+ crisis lines ${where}` : title,
      description: `${lines.length} free, confidential LGBTQ+ crisis and support line${lines.length === 1 ? '' : 's'} ${where}, with hours and how to reach them. In immediate danger, call your local emergency number.`,
    },
    body: `<main data-prerendered="bot-ua">
    <article>
      <h1>LGBTQ+ crisis lines ${escape(where)}</h1>
      <p>Free, confidential support lines for LGBTQ+ people ${escape(where)}. If you are in immediate danger, call your local emergency number first.</p>
      <ul>
        ${items}
      </ul>
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/help">Crisis lines in other countries</a></li>
        <li><a href="/organizations">Support organizations</a></li>
      </ul>
    </nav>
  </main>`,
    jsonLd: '',
    indexable: true,
  };
}

export async function helpCountryDetail(env: Env, pathname: string): Promise<DetailResult | null> {
  const m = pathname.match(HELP_COUNTRY_RE);
  if (!m) return null;
  const result = buildHelpCountry(m[1], await fetchHelpHotlines(env));
  // The canonical is built from the raw path, so /help/DE would be a second
  // indexable copy of /help/de. Only the lowercase form is indexable.
  return m[1] === m[1].toLowerCase() ? result : { ...result, indexable: false };
}

export function helpSitemapEntries(hotlines: HelpHotline[], lastmod: string) {
  return helpCountryCodes(hotlines).map((cc) => ({
    loc: `${ORIGIN}/help/${cc.toLowerCase()}`,
    lastmod,
    changefreq: 'weekly' as const,
    priority: 0.6,
  }));
}
