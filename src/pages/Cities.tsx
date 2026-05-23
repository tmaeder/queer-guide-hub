import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useCitiesDirectory } from '@/hooks/useCitiesDirectory';
import { useCitiesUrlState } from '@/hooks/useCitiesUrlState';
import { ErrorState } from '@/components/ui/EmptyState';
import { PageHero } from '@/components/discovery';
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
          <div className="grid grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-6 py-6">
            <div className="lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:pr-2">
              <CityListPane
                cities={filtered}
                loading={loading}
                venueCounts={venueCounts}
                selectedCityId={url.city || null}
                onHoverCity={setHoveredCityId}
                hasActiveFilters={hasActiveFilters}
              />
            </div>
            <div className="hidden lg:block lg:sticky lg:top-[200px] lg:self-start lg:h-[calc(100vh-220px)] rounded-container overflow-hidden border border-border bg-muted">
              <CitiesMapPane
                cities={filtered}
                selectedCityId={url.city || null}
                hoveredCityId={hoveredCityId}
                onSelectCity={url.setCity}
                onHoverCity={setHoveredCityId}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
