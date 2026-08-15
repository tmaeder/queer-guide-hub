import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FilterChip } from '@/components/transit/FilterChip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { fetchAutocomplete } from '@/lib/searchClient';
import { getRecentlyViewed } from '@/lib/recentlyViewed';
import { resolveRegionBySlug, type HomeRegionApi } from '@/hooks/useHomeRegion';

/**
 * "Near Berlin ▾" — the visible, correctable statement of which region the
 * homepage is showing.
 *
 * It exists because the region is a *guess* for most visitors: silently
 * scoping content to an IP city leaves someone unable to tell why they are
 * seeing what they see, or to fix it when the guess is wrong.
 *
 * Ink only. A region is not a state, and the track colours are wayfinding —
 * fill-only, ink-bordered, one accent per context, and never a status signal.
 *
 * There is deliberately no "nearby cities" option: the only radius path in the
 * app prompts for `navigator.geolocation`, and asking someone in a
 * criminalising country for their position to sort a homepage is not a trade
 * this product makes. Recents plus search covers the correction case.
 */
export function RegionChip({ region }: { region: HomeRegionApi }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Recents store `title`, autocomplete returns `name` — normalize both to one
  // shape so the list below has a single render path.
  const recentCities: Array<{ slug: string; name: string }> = getRecentlyViewed()
    .filter((i) => i.type === 'city' && i.slug)
    .slice(0, 4)
    .map((i) => ({ slug: i.slug, name: i.title }));

  const { data: matches = [] } = useQuery({
    queryKey: ['region-chip-search', query],
    enabled: open && query.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Typo-tolerant and already deployed — no new endpoint for this.
      const hits = await fetchAutocomplete(query.trim(), ['city'], 6);
      return hits
        .map((h) => ({ slug: (h.slug as string) ?? null, name: (h.title || h.name) as string }))
        .filter((h): h is { slug: string; name: string } => !!h.slug && !!h.name);
    },
  });

  async function pick(slug: string) {
    const value = await resolveRegionBySlug(slug);
    if (value) region.setRegion(value);
    setOpen(false);
    setQuery('');
  }

  const label = region.loading
    ? t('home.region.loading', 'Locating…')
    : region.cityName
      ? region.inferred
        ? t('home.region.near', 'Near {{city}}', { city: region.cityName })
        : region.cityName
      : t('home.region.pick', 'Pick your city');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterChip
          active={open}
          // A fixed minimum width so resolving the region swaps the label
          // without the band's head reflowing around it.
          className="min-w-32 justify-between"
          label={
            <>
              <span className="truncate">{label}</span>
              <span aria-hidden>▾</span>
            </>
          }
          aria-label={t('home.region.change', 'Change region')}
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 border-2 border-foreground p-0">
        <div className="border-b-2 border-foreground p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('home.region.search', 'Search a city…')}
            aria-label={t('home.region.search', 'Search a city…')}
          />
        </div>
        <ul className="m-0 max-h-64 list-none overflow-auto p-0">
          {region.source === 'override' && (
            <li>
              <button
                type="button"
                onClick={() => {
                  region.setRegion(null);
                  setOpen(false);
                }}
                className="w-full px-4 py-2 text-start text-13 font-bold hover:bg-foreground hover:text-background"
              >
                {t('home.region.useMyArea', 'Use my area')}
              </button>
            </li>
          )}
          {(query.trim().length >= 2 ? matches : recentCities).map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => pick(c.slug)}
                className="w-full truncate px-4 py-2 text-start text-13 hover:bg-foreground hover:text-background"
              >
                {c.name}
              </button>
            </li>
          ))}
          {query.trim().length >= 2 && matches.length === 0 && (
            <li className="px-4 py-4 text-13 text-muted-foreground">
              {t('home.region.noMatch', 'No city by that name.')}
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
