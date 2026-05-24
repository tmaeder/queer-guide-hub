import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useCitiesDirectory } from '@/hooks/useCitiesDirectory';
import { useCitiesUrlState } from '@/hooks/useCitiesUrlState';
import { usePrideCalendar } from '@/hooks/usePrideCalendar';
import { buildPrideByCity } from '@/utils/prideForCity';
import { ErrorState } from '@/components/ui/EmptyState';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHero } from '@/components/discovery';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ArrowRight } from 'lucide-react';
import { CitiesFilterBar } from './cities/CitiesFilterBar';
import { CityListPane } from './cities/CityListPane';
import { CitiesMapPane } from './cities/CitiesMapPane';

export default function Cities() {
  const { t } = useTranslation();
  const url = useCitiesUrlState();
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null);

  const filterParams = useMemo(
    () => ({
      q: url.q,
      continents: url.continents,
      tiers: url.tiers,
      sort: url.sort,
    }),
    [url.q, url.continents, url.tiers, url.sort],
  );

  const {
    cities,
    filtered,
    continents,
    venueCounts,
    loading,
    error,
  } = useCitiesDirectory(filterParams);

  // Pride-soon pill data — fetch current year, plus next year only when the
  // 90-day window from today crosses into January, so we don't double-fetch
  // for most of the year.
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
    description: t(
      'cities.metaDescription',
      'Browse LGBTQ+ friendly cities around the world.',
    ),
    canonicalPath: '/cities',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Cities',
      description: 'Browse LGBTQ+ friendly cities around the world.',
      url: 'https://queer.guide/cities',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  const hasActiveFilters = url.q.length > 0 || url.continents.size > 0 || url.tiers.size > 0;
  const showList = url.view === 'list';
  const showMap = url.view === 'map';

  return (
    <div className="relative">
      <PageHero
        eyebrow={t('cities.eyebrow', 'Destinations')}
        title={t('cities.title', 'Cities.')}
        lede={t('cities.subtitle', 'LGBTQ+ friendly cities around the world.')}
        primaryCta={{ label: t('cities.planTrip', 'Plan a trip'), href: '/travel' }}
        secondaryCta={{
          label: t('cities.openDirectory', 'Open the directory'),
          href: '/directory',
        }}
        size="sm"
      />
      <div className="container mx-auto px-4 relative">
        <CitiesFilterBar
          q={url.q}
          onQChange={url.setQ}
          continents={continents}
          selectedContinents={url.continents}
          onToggleContinent={url.toggleContinent}
          selectedTiers={url.tiers}
          onToggleTier={url.toggleTier}
          sort={url.sort}
          onSortChange={url.setSort}
          totalCount={cities.length}
          filteredCount={filtered.length}
          onReset={url.reset}
        />

        {error ? (
          <div className="py-6">
            <ErrorState message={error} />
          </div>
        ) : (
          <>
            {/* Mobile-only tabs */}
            <div className="lg:hidden pt-4">
              <Tabs
                value={url.view}
                onValueChange={(v) => url.setView(v === 'map' ? 'map' : 'list')}
              >
                <TabsList aria-label={t('cities.viewToggleAriaLabel', 'Toggle list and map')}>
                  <TabsTrigger value="list">{t('cities.viewList', 'List')}</TabsTrigger>
                  <TabsTrigger value="map">{t('cities.viewMap', 'Map')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-6 py-6">
              <div
                className={cn(
                  'lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:pr-2 lg:block',
                  !showList && 'hidden',
                )}
              >
                <CityListPane
                  cities={filtered}
                  loading={loading}
                  venueCounts={venueCounts}
                  prideByCity={prideByCity}
                  selectedCityId={url.city || null}
                  onHoverCity={setHoveredCityId}
                  hasActiveFilters={hasActiveFilters}
                />
              </div>
              <div
                className={cn(
                  'lg:block lg:sticky lg:top-[200px] lg:self-start lg:h-[calc(100vh-220px)] rounded-container overflow-hidden border border-border bg-muted',
                  // On mobile, take ~60vh when map view is active.
                  showMap ? 'h-[60vh]' : 'hidden',
                )}
              >
                <CitiesMapPane
                  cities={filtered}
                  selectedCityId={url.city || null}
                  hoveredCityId={hoveredCityId}
                  onSelectCity={url.setCity}
                  onHoverCity={setHoveredCityId}
                />
              </div>
            </div>

            {/* Footer CTA: route browsers to the submission flow. */}
            <div className="border-t border-border py-8 mb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-title font-semibold m-0">
                    {t('cities.suggestTitle', 'Missing a city?')}
                  </p>
                  <p className="text-13 text-muted-foreground mt-1 m-0">
                    {t(
                      'cities.suggestLede',
                      'Suggest one — adds to the directory after review.',
                    )}
                  </p>
                </div>
                <LocalizedLink
                  to="/submit"
                  className="inline-flex items-center gap-2 rounded-full border border-foreground px-6 py-3 text-sm font-bold tracking-tight text-foreground hover:bg-foreground hover:text-background transition-colors no-underline shrink-0"
                >
                  {t('cities.suggestCta', 'Suggest a city')}
                  <ArrowRight size={16} aria-hidden="true" />
                </LocalizedLink>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
