import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { DirectoryContinent } from '@/hooks/useCitiesDirectory';

interface CitiesLineIndexProps {
  continents: DirectoryContinent[];
  /** Counts honouring every filter EXCEPT continent — so a tile's number always
   *  matches the grid it opens. */
  facetCounts: ReadonlyMap<string, number>;
  selected: Set<string>;
  onToggle: (code: string) => void;
  onClear: () => void;
  loading: boolean;
}

/**
 * The C line's stop list: every continent as a station, with live counts.
 *
 * Two things are load-bearing, both learned from the marketplace's department index.
 *
 * FIRST, THIS RENDERS IN EVERY STATE. The obvious mistake is to hide the index once
 * a continent is selected (it sits next to the results, it feels redundant) — that
 * takes the map away from the reader at exactly the moment they started using it,
 * and leaves them no way back except the browser button.
 *
 * SECOND, THE TILES ARE BUTTONS, NOT LINKS. `public/_redirects` maps
 * `/cities/:slug → /city/:slug` with a 301 at the edge, so a `/cities/europe` URL
 * is unreachable in production no matter what the router says — that redirect is
 * why the compare tool lives at the singular `/city/compare`. Continents therefore
 * live in `?continent=`, which is also what keeps the whole index inside one
 * `role="group"` the way the filter contract expects.
 *
 * THIRD, BELOW `sm` IT IS A SCROLLABLE RAIL, NOT A GRID. Six tiles two-up at
 * 108px cost 437px — half a phone screen spent before a single city, on top of
 * an already-sticky filter bar. One 84px line costs a fifth of that, and stops
 * strung along a line is the more honest shape for this anyway.
 */
export function CitiesLineIndex({
  continents,
  facetCounts,
  selected,
  onToggle,
  onClear,
  loading,
}: CitiesLineIndexProps) {
  const { t } = useTranslation();

  if (!loading && continents.length === 0) return null;

  return (
    <section aria-labelledby="cities-continents">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 md:mb-6">
        <h2 id="cities-continents" className="m-0 font-display text-headline md:text-display">
          {t('cities.continentsTitle', 'Continents')}
        </h2>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-13 font-bold underline underline-offset-2"
          >
            {t('cities.continentClear', 'Clear')}
          </button>
        )}
      </div>

      {loading ? (
        // Fixed height, not a collapsed placeholder. VirtualizedGrid reads its
        // scroll offset ONCE from offsetTop, so a band that grows after mount
        // shifts every virtual row below it by the delta.
        <div className="flex gap-4 overflow-hidden sm:grid sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-[84px] w-[140px] shrink-0 animate-pulse border-[3px] border-foreground/20 bg-muted sm:h-[108px] sm:w-auto"
            />
          ))}
        </div>
      ) : (
        <div
          role="group"
          aria-label={t('cities.continentsAriaLabel', 'Filter by continent')}
          className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6"
        >
          {continents.map((c) => {
            const code = c.code.toLowerCase();
            const active = selected.has(code);
            const count = facetCounts.get(code) ?? 0;
            return (
              <button
                key={c.code}
                type="button"
                aria-pressed={active}
                onClick={() => onToggle(c.code)}
                className={cn(
                  // A station tile FILLS ink when it is the one you are standing
                  // at, and lifts when it is somewhere you could go. Never both —
                  // card-lift-sm is dropped on the active tile.
                  'flex h-[84px] w-[140px] shrink-0 flex-col justify-between border-[3px] border-foreground p-4 text-left sm:h-[108px] sm:w-auto',
                  active
                    ? 'bg-foreground text-background'
                    : 'bg-background text-foreground card-lift-sm',
                )}
              >
                <span className="text-title font-bold leading-tight text-balance">{c.name}</span>
                <span className="text-2xs uppercase tracking-label tabular-nums opacity-70">
                  {t('cities.continentCount', '{{count}} cities', { count })}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
