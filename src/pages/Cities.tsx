import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useCitiesDirectory } from '@/hooks/useCitiesDirectory';
import { useCitiesUrlState } from '@/hooks/useCitiesUrlState';
import { usePrideCalendar } from '@/hooks/usePrideCalendar';
import { buildPrideByCity } from '@/utils/prideForCity';
import { ErrorState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';
import { CitiesControlBar } from './cities/CitiesControlBar';
import { CitiesLineIndex } from './cities/CitiesLineIndex';
import { CityCardGrid } from './cities/CityCardGrid';
import { PageContainer, PAGE_BLEED, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';

// Map pane stays lazy: maplibre-gl is ~1.1 s of scripting on first load
// (Lighthouse #1094). It is now behind ?view=map, so the overwhelming majority of
// visits never parse the chunk at all.
const CitiesMapPane = lazy(() =>
  import('./cities/CitiesMapPane').then((m) => ({ default: m.CitiesMapPane })),
);

function MapPaneFallback() {
  return <div className="h-full w-full bg-muted" aria-hidden="true" />;
}

export default function Cities() {
  const { t } = useTranslation();
  const url = useCitiesUrlState();

  const filterParams = useMemo(
    () => ({
      q: url.q,
      continents: url.continents,
      tiers: url.tiers,
      sort: url.sort,
    }),
    [url.q, url.continents, url.tiers, url.sort],
  );

  const { cities, filtered, continents, continentFacets, loading, error } =
    useCitiesDirectory(filterParams);

  // Pride-soon pill data — current year, plus next year only when the 90-day
  // window from today crosses into January.
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const needsNextYear = today.getMonth() >= 9; // Oct (0-indexed) and later
  const prideCurrent = usePrideCalendar({ year: currentYear });
  const prideNext = usePrideCalendar({ year: currentYear + 1, enabled: needsNextYear });
  const prideByCity = useMemo(
    () => buildPrideByCity([...(prideCurrent.data ?? []), ...(prideNext.data ?? [])], today),
    [prideCurrent.data, prideNext.data, today],
  );

  useMeta({
    title: t('cities.metaTitle', 'Cities'),
    description: t('cities.metaDescription', 'Browse LGBTQ+ friendly cities around the world.'),
    canonicalPath: '/cities',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Cities',
      description: 'Browse LGBTQ+ friendly cities around the world.',
      url: 'https://queer.guide/cities',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
      // The page is a list of named, linked things; saying so is free and is
      // what the grid has always earned. Capped so the payload stays a hint to a
      // crawler rather than a second copy of the directory.
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: filtered.length,
        itemListElement: filtered.slice(0, 20).map((city, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: city.name,
          url: `https://queer.guide/city/${city.slug || city.id}`,
        })),
      },
    },
  });

  const hasActiveFilters = url.q.length > 0 || url.continents.size > 0 || url.tiers.size > 0;
  const showMap = url.view === 'map';

  // Defer the map mount until after first paint. When the user has explicitly
  // asked for the map view, mount on the next tick instead of waiting for idle.
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (!showMap || mapReady) return;
    const id = window.setTimeout(() => setMapReady(true), 0);
    return () => window.clearTimeout(id);
  }, [showMap, mapReady]);

  return (
    <div className="relative">
      {/* ---- Masthead ------------------------------------------------------ */}
      {/* Not PageHero: it ships rounded-full pill CTAs and a spotlight effect,
          the one primitive the rebrand has not reached. */}
      <header className="border-b-4 border-foreground">
        <PageContainer flush className="pb-8 pt-8 md:pb-12 md:pt-16">
          <div className="flex items-center gap-4">
            <RouteBullet type="city" size={44} />
            <span className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {t('cities.lineEyebrow', 'Cities · Green line')}
            </span>
          </div>
          {/* Anton comes from the global h1 rule; adding font-bold would ask a
              single-weight face to synthesize one. */}
          <h1 className="mt-4 font-display text-hero leading-[0.95] text-foreground">
            {t('cities.title', 'Cities.')}
          </h1>
          <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
            {loading
              ? t('cities.counting', 'Counting…')
              : t(
                  'cities.inView',
                  '{{count}} cities in the directory, ranked by how much of each one we hold.',
                  {
                    count: cities.length,
                  },
                )}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button asChild>
              <LocalizedLink to="/travel">{t('cities.planTrip', 'Plan a trip')}</LocalizedLink>
            </Button>
            <Button
              variant="outline"
              onClick={() => url.setView(showMap ? 'list' : 'map')}
              aria-pressed={showMap}
            >
              {showMap ? t('cities.viewList', 'List') : t('cities.openMap', 'Open the map')}
            </Button>
          </div>
        </PageContainer>
      </header>

      {/* ---- Control band --------------------------------------------------- */}
      <div
        className={cn(
          'sticky z-20 border-b-4 border-foreground bg-background',
          STICKY_UNDER_HEADER,
        )}
      >
        <PageContainer flush className="py-4 md:py-6">
          <CitiesControlBar
            q={url.q}
            onQChange={url.setQ}
            selectedTiers={url.tiers}
            onToggleTier={url.toggleTier}
            sort={url.sort}
            onSortChange={url.setSort}
            totalCount={cities.length}
            filteredCount={filtered.length}
            onReset={url.reset}
            hasFilters={hasActiveFilters}
          />
        </PageContainer>
      </div>

      {error ? (
        <PageContainer>
          <ErrorState message={error} />
        </PageContainer>
      ) : showMap ? (
        /* ---- Map view ----------------------------------------------------- */
        <PageContainer>
          <section
            className={cn('h-[70vh] overflow-hidden border-y-4 border-foreground', PAGE_BLEED)}
          >
            {mapReady ? (
              <Suspense fallback={<MapPaneFallback />}>
                <CitiesMapPane
                  cities={filtered}
                  selectedCityId={url.city || null}
                  onSelectCity={url.setCity}
                />
              </Suspense>
            ) : (
              <MapPaneFallback />
            )}
          </section>
        </PageContainer>
      ) : (
        <>
          {/* ---- Continent line index --------------------------------------- */}
          <div className="border-b-4 border-foreground">
            <PageContainer flush className="py-8 md:py-12">
              <CitiesLineIndex
                continents={continents}
                facetCounts={continentFacets}
                selected={url.continents}
                onToggle={url.toggleContinent}
                onClear={url.clearContinents}
                loading={loading}
              />
            </PageContainer>
          </div>

          {/* ---- The grid ---------------------------------------------------- */}
          <PageContainer>
            {/* The heading is sr-only: the band above it is the visible "where am
                I". Its existence is what replaces the old role="list" landmark,
                which a virtualized grid of <div> rows cannot carry without
                failing axe's aria-required-children. */}
            <section aria-labelledby="cities-grid-heading">
              <h2 id="cities-grid-heading" className="sr-only">
                {t('cities.listLabel', 'Cities')}
              </h2>
              <CityCardGrid
                cities={filtered}
                loading={loading}
                prideByCity={prideByCity}
                selectedCityId={url.city || null}
                hasActiveFilters={hasActiveFilters}
              />
            </section>
          </PageContainer>
        </>
      )}

      {/* ---- Tail ----------------------------------------------------------- */}
      <section className="border-t-4 border-foreground">
        <PageContainer flush className="py-8 md:py-12">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card-lift group relative border-[3px] border-foreground p-6">
              <h3 className="m-0 font-display text-headline">
                {t('cities.mapTeaserTitle', 'See it on the map')}
              </h3>
              <p className="mt-2 text-13 text-muted-foreground">
                {t(
                  'cities.mapTeaserLede',
                  'Every city as a pin, coloured by its country’s equality score.',
                )}
              </p>
              <button
                type="button"
                onClick={() => url.setView('map')}
                aria-label={t('cities.mapTeaserTitle', 'See it on the map')}
                className="absolute inset-0"
              />
            </div>
            <div className="card-lift group relative border-[3px] border-foreground p-6">
              <h3 className="m-0 font-display text-headline">
                {t('cities.suggestTitle', 'Missing a city?')}
              </h3>
              <p className="mt-2 text-13 text-muted-foreground">
                {t('cities.suggestLede', 'Suggest one — adds to the directory after review.')}
              </p>
              <LocalizedLink
                to="/submit"
                aria-label={t('cities.suggestCta', 'Suggest a city')}
                className="absolute inset-0 no-underline"
              />
            </div>
          </div>
        </PageContainer>
      </section>
    </div>
  );
}
