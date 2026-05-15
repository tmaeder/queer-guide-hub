import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOptimizedCities } from '@/hooks/usePlaces';
import { useMeta } from '@/hooks/useMeta';
import { DirectoryCard } from '@/components/directory/DirectoryCard';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { PageLoading } from '@/components/ui/loading';
import { Building2 } from 'lucide-react';
import { PageHero, BentoSection, spansForPreset } from '@/components/discovery';
import { cn } from '@/lib/utils';

const BENTO_SPAN_CLASS: Record<string, string> = {
  sm: 'col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3',
  md: 'col-span-12 sm:col-span-6 md:col-span-4',
  lg: 'col-span-12 sm:col-span-6 md:col-span-6',
  wide: 'col-span-12 md:col-span-8',
  tall: 'col-span-12 sm:col-span-6 md:col-span-4 row-span-2',
};

export default function Cities() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const { cities, loading, error } = useOptimizedCities({ limit: 200 });

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

  const filtered = useMemo(() => {
    if (!search.trim()) return cities;
    const q = search.trim().toLowerCase();
    return cities.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.region_name?.toLowerCase().includes(q) ||
        c.name_en?.toLowerCase().includes(q) ||
        c.name_de?.toLowerCase().includes(q),
    );
  }, [cities, search]);

  return (
    <div className="relative">
      <PageHero
        eyebrow={t('cities.eyebrow', 'Destinations')}
        title={t('cities.title', 'Cities.')}
        lede={t('cities.subtitle', 'LGBTQ+ friendly cities around the world.')}
        primaryCta={{ label: t('cities.planTrip', 'Plan a trip'), href: '/travel' }}
        secondaryCta={{ label: t('cities.openDirectory', 'Open the directory'), href: '/directory' }}
        size="md"
      />
      <div className="container mx-auto py-8 md:py-12 px-4 relative">
      <div className="mb-8 max-w-[480px]">
        <Input
          aria-label={t('cities.searchAriaLabel', 'Search cities')}
          placeholder={t('cities.searchPlaceholder', 'Search cities…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <PageLoading />
      ) : error ? (
        <ErrorState message={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t('cities.emptyTitle', 'No cities found')}
          description={
            search
              ? t('cities.emptySearch', 'Try a different search term.')
              : t('cities.empty', 'No cities are currently listed.')
          }
        />
      ) : (
        <BentoSection preset="mosaic">
          {filtered.map((city, i) => (
            <div
              key={city.id}
              className={cn(BENTO_SPAN_CLASS[spansForPreset('mosaic', i, filtered.length)], 'cursor-pointer')}
            >
              <DirectoryCard
                type="city"
                name={city.name}
                data={city}
                onClick={() => (window.location.href = `/city/${city.slug || city.id}`)}
              />
            </div>
          ))}
        </BentoSection>
      )}
      </div>
    </div>
  );
}
