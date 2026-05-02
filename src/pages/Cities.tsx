import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOptimizedCities } from '@/hooks/useOptimizedPlaces';
import { useMeta } from '@/hooks/useMeta';
import { DirectoryCard } from '@/components/directory/DirectoryCard';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { PageLoading } from '@/components/ui/loading';
import { Building2 } from 'lucide-react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

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
    <Container maxWidth="xl" sx={{ py: { xs: 4, md: 6 } }}>
      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '2rem', md: '2.5rem' },
            fontWeight: 800,
            letterSpacing: '-0.025em',
            mb: 1,
          }}
        >
          {t('cities.title', 'Cities')}
        </Typography>
        <Typography sx={{ color: 'text.secondary' }}>
          {t('cities.subtitle', 'Explore LGBTQ+ friendly cities around the world.')}
        </Typography>
      </Box>

      <Box sx={{ mb: 4, maxWidth: 480 }}>
        <Input
          aria-label={t('cities.searchAriaLabel', 'Search cities')}
          placeholder={t('cities.searchPlaceholder', 'Search cities…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Box>

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
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: '1fr 1fr',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            gap: 3,
          }}
        >
          {filtered.map((city) => (
            <Box
              key={city.id}
              sx={{
                cursor: 'pointer',
                transition: 'transform 0.2s',
                '&:hover': { transform: 'scale(1.03)' },
              }}
            >
              <DirectoryCard
                type="city"
                name={city.name}
                data={city}
                onClick={() => (window.location.href = `/city/${city.slug || city.id}`)}
              />
            </Box>
          ))}
        </Box>
      )}
    </Container>
  );
}
