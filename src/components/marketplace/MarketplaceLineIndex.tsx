import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useDepartmentCovers, useMarketplaceDepartmentCounts } from '@/hooks/useMarketplaceQueries';
import { useAdultAcknowledgement } from '@/hooks/useAdultContent';
import { ADULT_DEPARTMENTS, DEPARTMENT_ORDER, departmentLabel } from '@/lib/marketplaceTaxonomy';
import { Image } from '@/components/ui/Image';
import { cn } from '@/lib/utils';

/**
 * The M line's stop list: every department as a station, with live counts.
 *
 * Replaces DepartmentBento, which was two things this page could not afford.
 * It was an asymmetric magazine bento — a device from a different design
 * language than the one the site now speaks — and it carried nine lucide
 * glyphs (Shirt, Waves, Droplets, Lock…), which would have to go the moment a
 * TransitIcon appeared anywhere on this page: "never mix TransitIcon with
 * lucide in the same surface". Departments are stops, so they get station
 * tiles, and the type name does the work an ambiguous glyph was doing badly.
 *
 * The important change is not the shape, it is WHEN this renders. The bento
 * was inside the page's `!hasActiveFilters` block, so choosing a department
 * made the entire department index vanish — the reader lost the map at exactly
 * the moment they started using it. This renders in every state and marks the
 * station you are standing at, which is what makes a filter feel like a
 * position on a line rather than a different page.
 */
export function MarketplaceLineIndex({ activeDepartment }: { activeDepartment?: string }) {
  // Count what the visitor will actually see: gated to their 18+ state, so a tile's
  // number always matches the grid it opens. Adult-only departments stay hidden until
  // the visitor has opted in (their category pages are age-gated anyway).
  const { acknowledged } = useAdultAcknowledgement();
  const { data: departments, loading } = useMarketplaceDepartmentCounts(acknowledged);
  const { data: covers } = useDepartmentCovers();

  const counts = new Map(departments.map((d) => [d.slug, d.count]));
  const tiles = DEPARTMENT_ORDER.filter((d) => d !== 'other' && (counts.get(d) ?? 0) > 0)
    .filter((d) => acknowledged || !ADULT_DEPARTMENTS.has(d))
    .map((d) => ({ slug: d, count: counts.get(d) ?? 0 }));

  if (!loading && tiles.length === 0) return null;

  return (
    <section aria-labelledby="category-tiles">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="category-tiles" className="font-display text-headline">
          Departments
        </h2>
        <LocalizedLink
          to="/marketplace/categories"
          className="text-13 font-bold no-underline hover:underline"
        >
          See all categories
        </LocalizedLink>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-[132px] animate-pulse border-[3px] border-foreground/20 bg-muted"
            />
          ))}
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 lg:grid-cols-5">
          {tiles.map((tile) => {
            const active = tile.slug === activeDepartment;
            const cover = covers.get(tile.slug);
            return (
              <li key={tile.slug}>
                <LocalizedLink
                  to={`/marketplace/category/${tile.slug}`}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    // A station tile FILLS ink when it is the one you are at,
                    // and lifts when it is somewhere you could go. Never both:
                    // card-lift-sm is dropped on the active tile.
                    'group flex h-full flex-col justify-between border-[3px] border-foreground no-underline',
                    active ? 'bg-foreground text-background' : 'bg-card card-lift-sm',
                  )}
                >
                  {cover ? (
                    <div className="border-b-[3px] border-foreground">
                      <Image src={cover} alt="" aspect="card" rounded="none" />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-1 p-4">
                    <span className="text-title font-bold leading-tight text-balance">
                      {departmentLabel(tile.slug)}
                    </span>
                    <span
                      className={cn(
                        'text-2xs uppercase tracking-label tabular-nums',
                        active ? 'text-background/80' : 'text-muted-foreground',
                      )}
                    >
                      {tile.count.toLocaleString()} listing{tile.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </LocalizedLink>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
