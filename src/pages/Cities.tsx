import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useCitiesDirectory } from '@/hooks/useCitiesDirectory';
import { useCitiesUrlState } from '@/hooks/useCitiesUrlState';
import { ErrorState } from '@/components/ui/EmptyState';
import { PageHero } from '@/components/discovery';
import { CitiesFilterBar } from './cities/CitiesFilterBar';
import { CityListPane } from './cities/CityListPane';

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
        <div className="py-6">
          {error ? (
            <ErrorState message={error} />
          ) : (
            <CityListPane
              cities={filtered}
              loading={loading}
              venueCounts={venueCounts}
              hasActiveFilters={hasActiveFilters}
            />
          )}
        </div>
      </div>
    </div>
  );
}
