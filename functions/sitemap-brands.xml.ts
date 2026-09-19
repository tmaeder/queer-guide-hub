import {
  fetchRows,
  urlsetXml,
  xmlResponse,
  ORIGIN,
  type Env,
  type SitemapEntry,
} from './_lib/sitemap';

/**
 * /sitemap-brands.xml — marketplace maker pages (`/marketplace/brands/:slug`).
 *
 * These had no sitemap for as long as they have existed, and until 2026-09-19
 * that was CORRECT: the route had no crawler-side head injection at all, so
 * every maker URL served the generic SPA shell and a sitemap would have pointed
 * Google at ~871 identical-looking pages. `functions/_lib/detail.ts` gained a
 * `brand` branch that day (own title, description, og:*, Brand JSON-LD, bot-UA
 * body), which is what makes advertising them worth doing.
 *
 * ── the status filter is load-bearing, not belt-and-braces ──
 * `fetchRows` reads with the SERVICE ROLE, so RLS filters NOTHING here. The
 * `marketplace_brands_public_read` policy that limits anonymous callers to
 * approved rows does not apply, and the table holds ~5,142 rows against 871
 * approved ones. Measured 2026-09-19 through the anon key (i.e. through RLS):
 * 871 rows with a slug, all approved. Through the service role that same query
 * returns the pending and rejected rows too. Omitting `status=eq.approved`
 * would therefore advertise thousands of unreviewed rows — and it would look
 * fine in any check written against the anon key.
 *
 * ── approved-only is a DELIBERATE narrowing, not a copy of the page gate ──
 * `brandDetail` does NOT gate indexability on `is_approved`: a pending brand is
 * a real product grouping, the SPA renders it, and it was already indexed
 * before head injection existed, so noindexing that cohort would have been a
 * new policy rather than a fix. Advertising is a different question from
 * indexing. A sitemap is a positive recommendation to crawl, and recommending a
 * row no human has reviewed is a claim this file is not willing to make. The
 * two rules are allowed to differ, and this comment exists so the difference
 * reads as a decision rather than an oversight.
 *
 * ── NULL slug is how a retired maker is retired ──
 * `99100101143000` retired 20 feed-ID artifacts (a merchant's PO numbers
 * published as makers) by NULLing their slug precisely so the lookup cannot
 * match. `slug=not.is.null` is what keeps them out; a filter on status alone
 * would not, because they are `rejected` AND slugless and only one of those two
 * facts is being tested here.
 *
 * ── product_count > 0 ──
 * A maker page with no listings is a thin page. Measured 2026-09-19 this drops
 * ZERO rows (all 871 approved brands have listings), so it changes nothing
 * today and states the intent for the day a brand's last listing goes inactive.
 *
 * ── NO lastmod, and that is a measurement rather than an omission ──
 * The obvious choice is `updated_at`, and it is wrong here. Measured across the
 * approved rows on 2026-09-19: 869 of 871 carry the SAME date, because the
 * weekly `marketplace_register_brands` sync re-derives every brand row whether
 * or not anything about that brand changed. A lastmod identical on 99.8% of a
 * sitemap's URLs, moving en masse once a week, carries no per-page information
 * and is the shape Google discounts — `sitemap-villages.xml` records the same
 * trap from the other direction ("a lastmod that reads 'today' for every URL on
 * every fetch is lastmod spam"). It would also be a false claim: a batch
 * re-derive is not a change to what the page shows, which is the brand's
 * listings.
 *
 * `<lastmod>` is optional and omitting it leaves Google on its own signals,
 * which is strictly better than an inaccurate one. The honest per-page signal
 * would be the newest `updated_at` among that brand's listings — a per-row
 * aggregate this flat select cannot express. Worth adding IF it can be done
 * without a join; do not restore `updated_at` here without re-measuring that
 * 869/871 first.
 */
export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const rows = await fetchRows(
    env,
    'marketplace_brands',
    'slug',
    'slug=not.is.null&status=eq.approved&product_count=gt.0',
  );

  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/marketplace/brands/${encodeURIComponent(r.slug as string)}`,
      // No lastmod — see the header. The only candidate is identical on 869 of
      // 871 rows.
      changefreq: 'weekly' as const,
      // Below venues/places (0.6-0.7): a maker page is a product grouping, not
      // a destination. Above nothing in particular — this is the value the
      // directory itself carries at `/marketplace/brands` minus one step.
      priority: 0.5,
    }));

  return xmlResponse(urlsetXml(entries), 3600);
};
