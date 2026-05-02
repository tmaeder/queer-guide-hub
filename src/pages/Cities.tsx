import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOptimizedCities } from '@/hooks/useOptimizedPlaces';
import { useMeta } from '@/hooks/useMeta';
import { DirectoryCard } from '@/components/directory/DirectoryCard';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { PageLoading } from '@/components/ui/loading';
import { Building2 } from 'lucide-react';

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
    <div className="container mx-auto py-8 md:py-12 px-4">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2">
          {t('cities.title', 'Cities')}
        </h1>
        <p className="text-muted-foreground">
          {t('cities.subtitle', 'Explore LGBTQ+ friendly cities around the world.')}
        </p>
      </div>

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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filtered.map((city) => (
            <div
              key={city.id}
              className="cursor-pointer transition-transform hover:scale-[1.03]"
            >
              <DirectoryCard
                type="city"
                name={city.name}
                data={city}
                onClick={() => (window.location.href = `/city/${city.slug || city.id}`)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
