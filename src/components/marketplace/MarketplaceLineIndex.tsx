import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useDepartmentCovers, useMarketplaceDepartmentCounts } from '@/hooks/useMarketplaceQueries';
import { useAdultAcknowledgement } from '@/hooks/useAdultContent';
import { ADULT_DEPARTMENTS, DEPARTMENT_ORDER, departmentLabel } from '@/lib/marketplaceTaxonomy';
import { horizontalLine } from '@/components/transit/lineGeometry';
import { Image } from '@/components/ui/Image';
import { cn } from '@/lib/utils';

/**
 * The line running above the stop list.
 *
 * DELIBERATELY RINGLESS. A station ring is a claim that the line stops exactly
 * there, and the tiles below wrap into a different number of columns at every
 * breakpoint — so any ring I drew would align with a tile at one width and
 * float between two at the next. `lineGeometry`'s whole point is that a station
 * is a cubic ENDPOINT rather than something "close enough" to the path
 * (invariant 1), and faking that here would spend the one guarantee the module
 * exists to give. The tiles are the stations; this is the track they sit on.
 *
 * Stretched, so it needs both escapes: `preserveAspectRatio="none"` to fill the
 * width, and `vector-effect` so the stroke does not fatten with it.
 */
function TrackRule() {
  const line = horizontalLine(4, { view: { w: 1000, h: 40 }, mid: 20, crest: 13 });
  return (
    <svg
      viewBox={line.viewBox}
      preserveAspectRatio="none"
      className="mb-6 hidden h-10 w-full md:block"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={line.segments.join(' ')}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-track-yellow"
      />
    </svg>
  );
}

/**
 * The M line's stop list: every department as a station, with live counts.
 *
 * The important property is not the shape, it is WHEN this renders. An earlier
 * version sat inside the page's `!hasActiveFilters` block, so choosing a
 * department made the entire department index vanish — the reader lost the map
 * at exactly the moment they started using it. This renders in every state and
 * marks the station you are standing at, which is what makes a filter feel like
 * a position on a line rather than a different page.
 *
 * Tile titles are Anton (`font-display`), matching the design project's
 * category hub. That is a rank-4 slot filled with a rank-3 face on purpose —
 * a station name on a transit map is set in the display face, and the section
 * heading above still outranks it by size.
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
        <h2 id="category-tiles" className="font-display text-display">
          Departments
        </h2>
        <LocalizedLink
          to="/marketplace/categories"
          className="text-15 font-bold no-underline hover:underline"
        >
          All categories →
        </LocalizedLink>
      </div>

      <TrackRule />

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="border h-[132px] animate-pulse border-foreground/20 bg-muted"
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
                    'group flex h-full flex-col justify-between border border-border-hairline no-underline',
                    active ? 'bg-foreground text-background' : 'bg-card card-lift-sm',
                  )}
                >
                  {cover ? (
                    <div className="border-b border-border-hairline">
                      <Image src={cover} alt="" aspect="card" rounded="none" />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-1 p-4">
                    {/* Space Grotesk 700, NOT Anton. The design project's
                        category hub sets these tiles in the display face, but
                        rank 4 is Space Grotesk here and `rankFourFace.test.ts`
                        enforces it — `text-title` may never carry a display
                        face. The repo's rank table outranks the mock. */}
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
