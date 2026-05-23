import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useCitiesDirectory } from '@/hooks/useCitiesDirectory';
import { useCitiesUrlState } from '@/hooks/useCitiesUrlState';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/EmptyState';
import { PageHero } from '@/components/discovery';
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

  const { filtered, venueCounts, cities, loading, error } = useCitiesDirectory(filterParams);

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
      <div className="container mx-auto py-8 md:py-12 px-4 relative">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="max-w-[480px] flex-1">
            <Input
              aria-label={t('cities.searchAriaLabel', 'Search cities')}
              placeholder={t('cities.searchPlaceholder', 'Search cities…')}
              value={url.q}
              onChange={(e) => url.setQ(e.target.value)}
            />
          </div>
          <p
            className="text-13 text-muted-foreground shrink-0"
            aria-live="polite"
            role="status"
          >
            {t('cities.resultCount', '{{shown}} of {{total}} cities', {
              shown: filtered.length,
              total: cities.length,
            })}
          </p>
        </div>

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
  );
}
