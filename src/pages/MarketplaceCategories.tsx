import { useMemo } from 'react';
import { useMeta } from '@/hooks/useMeta';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MarketplaceMasthead } from '@/components/marketplace/MarketplaceMasthead';
import { useMarketplaceSubcategoryGroupCounts } from '@/hooks/useMarketplaceQueries';
import { useAdultAcknowledgement } from '@/hooks/useAdultContent';
import {
  ADULT_DEPARTMENTS,
  DEPARTMENT_GROUPS,
  DEPARTMENT_ORDER,
  departmentLabel,
  groupLabel,
} from '@/lib/marketplaceTaxonomy';
import { PageContainer } from '@/components/layout/PageContainer';

/**
 * Every stop on the line, grouped by the line it belongs to.
 *
 * WHAT THIS PAGE USED TO RENDER, and why it must never go back:
 * it called `useMarketplaceSubcategoryTiles(null)` →
 * `get_marketplace_subcategory_counts`, which returns the RAW MERCHANT
 * `subcategory_slug` gated only by `HAVING count(*) >= 3`. Measured on prod:
 * 698 tiles (1,063 with 18+ on), of which 118 were merchant breadcrumb paths
 * (`pride_>_jersey_>_crop_jersey_shirts`), 195 carried URL-hostile punctuation,
 * and one was a filter facet string (`good_for_beginners,discreet,under_$50`,
 * 182 listings). `subcategory_slug` is a GENERATED column that replaces only
 * whitespace and hyphens, so `>`, `,`, `$`, `&` and `/` survived into the href
 * AND into `<link rel=canonical>`. Worse, every one of those 698 landed on
 * `MarketplaceCategory`'s legacy branch, which has no refinement UI at all.
 *
 * It now reads `subcategory_group` — the v3 classifier's canonical vocabulary,
 * 100% populated on every active listing — which is the same grain
 * `MarketplaceLineIndex` has always used for its department tiles.
 *
 * SECTIONED, NOT FLAT-RANKED, and that is load-bearing rather than taste. Six
 * group slugs collide with department slugs (apparel, underwear, swimwear,
 * jewelry, services, other). A flat grid would print a tile "Underwear 4,278"
 * one click from a hub tile "Underwear 6,202"; under a department heading that
 * also says Underwear, the two numbers read as hierarchy instead of as a bug.
 * The "All <department>" link in each heading row is what names the larger of
 * the two.
 *
 * LINKS GO TO `/marketplace/category/<department>?g=<group>`, never to
 * `/marketplace/category/<group>`: for those same six slugs the latter renders
 * the DEPARTMENT page, whose count disagrees with the tile the reader clicked.
 * `MarketplaceCategory` already reads `?g=`, so this needs no new route.
 *
 * The raw-slug routes still work and are deliberately untouched — inbound links
 * depend on them (see `marketplaceFilterParams.ts`). This page just stops
 * manufacturing them.
 */
export default function MarketplaceCategories() {
  // Same source as the hub, so a group's number here matches the grid it opens
  // and the department tile it sits under. Hardcoding SFW would make this page
  // disagree with the hub for every reader who has opted in.
  const { acknowledged } = useAdultAcknowledgement();
  const { data: groups, loading } = useMarketplaceSubcategoryGroupCounts(null, acknowledged);

  const { sections, orphans, stopCount } = useMemo(() => {
    const counts = new Map(groups.map((g) => [g.slug, g.count]));

    const built = DEPARTMENT_ORDER.filter((d) => d !== 'other')
      .filter((d) => acknowledged || !ADULT_DEPARTMENTS.has(d))
      .map((d) => ({
        slug: d,
        stops: (DEPARTMENT_GROUPS[d] ?? [])
          .filter((g) => (counts.get(g) ?? 0) > 0)
          .map((g) => ({ slug: g, count: counts.get(g) ?? 0 })),
      }))
      .filter((s) => s.stops.length > 0);

    // A group the SQL classifier returns that this client cannot route to a
    // department. Zero today, but the mirror in marketplaceTaxonomy.ts is kept
    // in sync with the SQL by hand, and `apparel` sat orphaned in exactly this
    // way — 782 listings that a naive iteration over DEPARTMENT_GROUPS dropped
    // without a trace. Surfacing beats silently losing a whole group; these
    // link through the browse filter, which needs no department.
    const routed = new Set(Object.values(DEPARTMENT_GROUPS).flat());
    const stray = groups
      .filter((g) => !routed.has(g.slug) && g.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      sections: built,
      orphans: stray,
      stopCount: built.reduce((n, s) => n + s.stops.length, 0) + stray.length,
    };
  }, [groups, acknowledged]);

  useMeta({
    title: 'All categories — Marketplace',
    description: 'Browse every queer-friendly marketplace category on Queer Guide.',
    canonicalPath: '/marketplace/categories',
  });

  return (
    <div className="min-h-screen">
      <MarketplaceMasthead
        size="page"
        backTo={{ label: 'Marketplace', to: '/marketplace' }}
        eyebrow="Marketplace · Every stop"
        title="All categories."
        // No longer "ranked by active listings" — the order is the canonical
        // one the department pages use, so the two agree.
        lede="Every queer-friendly marketplace category, grouped by department."
        count={
          loading
            ? 'Counting…'
            : `${stopCount.toLocaleString()} categor${stopCount === 1 ? 'y' : 'ies'} in ${sections.length} department${sections.length === 1 ? '' : 's'}`
        }
      />

      <PageContainer>
        {loading ? (
          <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <li key={i} aria-hidden="true" className="h-[120px] animate-pulse bg-muted" />
            ))}
          </ul>
        ) : sections.length === 0 && orphans.length === 0 ? (
          <p className="text-muted-foreground">
            No categories yet.{' '}
            <LocalizedLink to="/marketplace" className="underline underline-offset-4">
              Browse the marketplace
            </LocalizedLink>
          </p>
        ) : (
          <>
            {sections.map((section) => (
              <section
                key={section.slug}
                aria-labelledby={`dept-${section.slug}`}
                className="mb-12"
              >
                <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  {/* text-headline, not the hub's text-display: this heading
                      repeats up to ten times under a hero masthead, and the
                      rank ladder wants a step down from the page title. */}
                  <h2 id={`dept-${section.slug}`} className="font-display text-headline">
                    {departmentLabel(section.slug)}
                  </h2>
                  <LocalizedLink
                    to={`/marketplace/category/${section.slug}`}
                    className="text-15 font-bold no-underline hover:underline"
                  >
                    All {departmentLabel(section.slug).toLowerCase()} →
                  </LocalizedLink>
                </div>

                <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 lg:grid-cols-4">
                  {section.stops.map((stop) => (
                    <li key={stop.slug}>
                      <LocalizedLink
                        to={`/marketplace/category/${section.slug}?g=${stop.slug}`}
                        className="card-lift flex h-full min-h-[120px] flex-col justify-between bg-card p-4 no-underline sm:p-6 shadow-soft"
                      >
                        <span className="text-title font-bold leading-tight text-balance">
                          {groupLabel(stop.slug)}
                        </span>
                        <span className="mt-4 text-2xs uppercase tracking-label tabular-nums text-muted-foreground">
                          {stop.count.toLocaleString()} listing{stop.count !== 1 ? 's' : ''}
                        </span>
                      </LocalizedLink>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {orphans.length > 0 && (
              <section aria-labelledby="dept-more" className="mb-12">
                <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 id="dept-more" className="font-display text-headline">
                    More
                  </h2>
                </div>
                <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 lg:grid-cols-4">
                  {orphans.map((stop) => (
                    <li key={stop.slug}>
                      <LocalizedLink
                        to={`/marketplace?grp=${stop.slug}`}
                        className="card-lift flex h-full min-h-[120px] flex-col justify-between bg-card p-4 no-underline sm:p-6 shadow-soft"
                      >
                        <span className="text-title font-bold leading-tight text-balance">
                          {groupLabel(stop.slug)}
                        </span>
                        <span className="mt-4 text-2xs uppercase tracking-label tabular-nums text-muted-foreground">
                          {stop.count.toLocaleString()} listing{stop.count !== 1 ? 's' : ''}
                        </span>
                      </LocalizedLink>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </PageContainer>
    </div>
  );
}
