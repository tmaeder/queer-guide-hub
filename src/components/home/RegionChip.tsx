import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
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

  const searching = query.trim().length >= 2;
  const {
    data: matches = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['region-chip-search', query],
    enabled: open && searching,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Typo-tolerant and already deployed — no new endpoint for this.
      const hits = await fetchAutocomplete(query.trim(), ['city'], 6);
      return hits
        .map((h) => ({ slug: (h.slug as string) ?? null, name: (h.title || h.name) as string }))
        .filter((h): h is { slug: string; name: string } => !!h.slug && !!h.name);
    },
  });

  const selection = useMutation({
    mutationFn: async (slug: string) => {
      const value = await resolveRegionBySlug(slug);
      if (!value) throw new Error('City could not be resolved');
      return value;
    },
    onSuccess: (value) => {
      region.setRegion(value);
      setOpen(false);
      setQuery('');
    },
  });

  const label = region.loading
    ? t('home.discovery.locating', 'Finding your area…')
    : region.cityName
      ? region.inferred
        ? t('home.region.near', 'Near {{city}}', { city: region.cityName })
        : region.cityName
      : t('home.discovery.cityPick', 'Choose a city');

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !selection.isPending) selection.reset();
      }}
    >
      <PopoverTrigger asChild>
        <FilterChip
          active={open}
          // Reserve the same width for loading, inferred and selected labels.
          // The full city remains in the accessible name when text truncates.
          className="w-36 max-w-full justify-between"
          label={
            <>
              <span className="truncate">{label}</span>
              <span aria-hidden>▾</span>
            </>
          }
          // Name starts with the visible text (WCAG 2.5.3 label in name).
          aria-label={`${label} — ${t('home.discovery.cityChange', 'Change city')}`}
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 bg-muted rounded-element p-0">
        <div className="border-b border-border-hairline p-2">
          <Input
            value={query}
            disabled={selection.isPending}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('home.discovery.citySearch', 'Find a city…')}
            aria-label={t('home.discovery.citySearch', 'Find a city…')}
          />
        </div>
        <ul className="m-0 max-h-64 list-none overflow-auto p-0">
          {region.source === 'override' && (
            <li>
              <button
                type="button"
                disabled={selection.isPending}
                onClick={() => {
                  region.setRegion(null);
                  setOpen(false);
                }}
                className="min-h-11 w-full px-4 py-2 text-start text-13 font-bold hover:bg-foreground hover:text-background"
              >
                {t('home.discovery.useMyArea', 'Use my area')}
              </button>
            </li>
          )}
          {(searching ? matches : recentCities).map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                disabled={selection.isPending}
                onClick={() => selection.mutate(c.slug)}
                className="min-h-11 w-full truncate px-4 py-2 text-start text-13 hover:bg-foreground hover:text-background"
              >
                {c.name}
              </button>
            </li>
          ))}
          {(selection.isPending || (searching && isPending)) && (
            <li role="status" className="px-4 py-4 text-13">
              {t('common.loading', 'Loading…')}
            </li>
          )}
          {selection.isError && (
            <li role="status" className="px-4 py-4 text-13">
              {t('home.discovery.loadFailed', 'Couldn’t load these results.')}
            </li>
          )}
          {searching && isError && (
            <li className="px-4 py-4 text-13">
              <p role="status">{t('home.discovery.loadFailed', 'Couldn’t load these results.')}</p>
              <button type="button" className="min-h-11 underline" onClick={() => void refetch()}>
                {t('common.tryAgain')}
              </button>
            </li>
          )}
          {searching && !isPending && !isError && matches.length === 0 && (
            <li role="status" className="px-4 py-4 text-13 text-muted-foreground">
              {t('home.discovery.cityNoMatch', 'No matching cities.')}
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
