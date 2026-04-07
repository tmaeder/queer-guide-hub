import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { useMeta } from '@/hooks/useMeta';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PersonalityCard } from '@/components/personalities/PersonalityCard';
import { PersonalitiesFilters } from '@/components/personalities/PersonalitiesFilters';
import { AddPersonalityDialog } from '@/components/personalities/AddPersonalityDialog';
import { usePersonalities, PersonalityFilters } from '@/hooks/usePersonalities';
import { useAuth } from '@/hooks/useAuth';
import { Users } from 'lucide-react';
import Box from '@mui/material/Box';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';

export default function Personalities() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useMeta({
    title: 'Personalities',
    description:
      'Explore notable LGBTQ+ personalities — activists, artists, leaders, and historical figures.',
    canonicalPath: '/personalities',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Notable LGBTQ+ Personalities',
      description:
        'Explore notable LGBTQ+ personalities — activists, artists, leaders, and historical figures.',
      url: 'https://queer.guide/personalities',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  // Get profession from URL parameters
  const professionFromUrl = searchParams.get('profession');

  const [filters, setFilters] = useState<PersonalityFilters>({
    page: 1,
    limit: 100,
    profession: professionFromUrl || undefined,
  });
  const [selectedPersonality, setSelectedPersonality] = useState(null);

  // Update filters when URL changes
  useEffect(() => {
    const profession = searchParams.get('profession');
    if (profession !== filters.profession) {
      setFilters((prev) => ({ ...prev, profession: profession || undefined, page: 1 }));
    }
  }, [searchParams, filters.profession]);

  const { personalities, totalCount, loading, error } = usePersonalities(filters);

  const [sortBy, setSortBy] = useState<string>('az');

  const sortedPersonalities = useMemo(() => {
    const sorted = [...personalities];
    switch (sortBy) {
      case 'az':
        return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'za':
        return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      default:
        return sorted;
    }
  }, [personalities, sortBy]);

  const handlePersonalityClick = (personality: any) => {
    setSelectedPersonality(personality);
    navigate(`/personalities/${personality.id}`);
  };

  const handleFiltersChange = (newFilters: PersonalityFilters) => {
    setFilters({ ...newFilters, page: 1, limit: 100 }); // Reset to page 1 when filters change
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ px: 2, py: { xs: 6, md: 10 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
          {Array.from({ length: 8 }).map((_, i) => (<PersonalityCard key={i} loading />))}
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ px: 2, py: { xs: 6, md: 10 } }}>
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ px: 2, py: { xs: 6, md: 10 } }}>
        {/* Header */}
        <PageHeader
          title="Personalities"
          subtitle="Discover inspiring LGBTQ+ personalities who have made significant contributions to society"
          center
          actions={
            user ? <AddPersonalityDialog onSuccess={() => window.location.reload()} /> : undefined
          }
        />

        <Box sx={{ mb: 4 }}>
          <PersonalitiesFilters filters={filters} onFiltersChange={handleFiltersChange} />
        </Box>

        {/* Results */}
        {!loading && sortedPersonalities.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 3,
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Found {totalCount} result{totalCount !== 1 ? 's' : ''}
              </Typography>
              {filters.search && <Badge variant="secondary">Searching: "{filters.search}"</Badge>}
              {filters.profession && (
                <Badge variant="secondary">Profession: "{filters.profession}"</Badge>
              )}
            </Box>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger style={{ width: 140 }} aria-label="Sort personalities">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="az">A{'\u2013'}Z</SelectItem>
                <SelectItem value="za">Z{'\u2013'}A</SelectItem>
              </SelectContent>
            </Select>
          </Box>
        )}

        {sortedPersonalities.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No profiles match"
            description="Try a different search or browse all."
            mood="encouraging"
          />
        ) : (
          <StaggerGrid
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: '1fr 1fr',
                lg: 'repeat(3, 1fr)',
                xl: 'repeat(4, 1fr)',
              },
              gap: 3,
            }}
          >
            {sortedPersonalities.map((personality) => (
              <PersonalityCard
                key={personality.id}
                personality={personality}
                onClick={() => handlePersonalityClick(personality)}
              />
            ))}
          </StaggerGrid>
        )}
      </Container>
    </Box>
  );
}
