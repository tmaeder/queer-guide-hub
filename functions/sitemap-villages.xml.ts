import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  // seo_indexable + duplicate + shell_status gates, matching the other
  // sitemaps. shell_status is never NULL on this table, so `not.in` cannot
  // silently drop rows to the SQL NULL-comparison trap (verified 2026-08-02).
  // lastmod is the LATER of updated_at and last_verified_at, and that is not
  // belt-and-braces — reading updated_at alone published a 95-day-old date for
  // every village.
  //
  // Measured 2026-09-10: max(queer_villages.updated_at) = 2026-06-08 across all
  // 176 rows, because nothing writes that column any more. The village engine
  // is healthy — village_relink, village_trust_recompute,
  // village_completeness_recompute and village_agentic_enrich all ran that day
  // with consecutive_failures = 0 — but it maintains `last_verified_at` and the
  // geo_places spine row instead. Google treats lastmod as a recrawl hint, so a
  // June date told it not to bother with pages whose venue list village_relink
  // may have changed that morning.
  //
  // last_verified_at is a per-row rolling signal, NOT a daily blanket stamp:
  // the trailing days carry 14, 12, 14, 5, 17, 10 villages. That matters,
  // because a lastmod that reads "today" for every URL on every fetch is
  // lastmod spam and Google discounts it. geo_places.updated_at has the exact
  // same distribution — the two move on the same event — so this reads the one
  // table rather than joining the spine for an identical answer.
  const rows = await fetchRows(
    env,
    'queer_villages',
    'slug,updated_at,last_verified_at',
    'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&shell_status=not.in.(ghost,merged)',
  );
  const day = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : undefined;

  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => {
      const updated = day(r.updated_at);
      const verified = day(r.last_verified_at);
      // ISO dates compare correctly as strings; both may be absent.
      const lastmod =
        updated && verified ? (verified > updated ? verified : updated) : (verified ?? updated);
      return {
        loc: `${ORIGIN}/villages/${encodeURIComponent(r.slug as string)}`,
        lastmod,
        changefreq: 'monthly' as const,
        priority: 0.6,
      };
    });
  return xmlResponse(urlsetXml(entries), 3600);
};
