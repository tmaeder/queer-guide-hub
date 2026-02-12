import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMeta } from '@/hooks/useMeta';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonalityCard } from "@/components/personalities/PersonalityCard";
import { PersonalitiesFilters } from "@/components/personalities/PersonalitiesFilters";
import { AddPersonalityDialog } from "@/components/personalities/AddPersonalityDialog";
import { usePersonalities, PersonalityFilters } from "@/hooks/usePersonalities";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Plus } from "lucide-react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';

export default function Personalities() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  useMeta({
    title: 'Personalities',
    description: 'Explore notable LGBTQ+ personalities — activists, artists, leaders, and historical figures.',
    canonicalPath: '/personalities',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Notable LGBTQ+ Personalities',
      description: 'Explore notable LGBTQ+ personalities — activists, artists, leaders, and historical figures.',
      url: 'https://queer.guide/personalities',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  // Get profession from URL parameters
  const professionFromUrl = searchParams.get('profession');

  const [filters, setFilters] = useState<PersonalityFilters>({
    page: 1,
    limit: 100,
    profession: professionFromUrl || undefined
  });
  const [selectedPersonality, setSelectedPersonality] = useState(null);

  // Update filters when URL changes
  useEffect(() => {
    const profession = searchParams.get('profession');
    if (profession !== filters.profession) {
      setFilters(prev => ({ ...prev, profession: profession || undefined, page: 1 }));
    }
  }, [searchParams, filters.profession]);

  const { personalities, totalCount, loading, error } = usePersonalities(filters);

  // Randomize the order of personalities on each render
  const randomizedPersonalities = useMemo(() => {
    if (!personalities || personalities.length === 0) return [];

    const shuffled = [...personalities];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [personalities]);


  const handlePersonalityClick = (personality: any) => {
    setSelectedPersonality(personality);
    // Here you would typically navigate to a detail page or open a modal
    console.log('Selected personality:', personality);
  };

  const handleFiltersChange = (newFilters: PersonalityFilters) => {
    setFilters({ ...newFilters, page: 1, limit: 100 }); // Reset to page 1 when filters change
  };


  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ px: 2, py: 4 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 3 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 320, width: '100%' }} />
          ))}
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ px: 2, py: 4 }}>
        <Card>
          <CardContent style={{ paddingTop: 48, paddingBottom: 48 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Users style={{ height: 48, width: 48, margin: '0 auto 16px auto', display: 'block', color: 'var(--muted-foreground)' }} />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Error Loading Personalities</Typography>
              <Typography sx={{ color: 'var(--muted-foreground)' }}>{error}</Typography>
            </Box>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ px: 2, py: 4 }}>
        {/* Header */}
        <Card style={{ marginBottom: 32 }}>
          <CardContent style={{ padding: 32, textAlign: 'center' }}>
            <Typography variant="h2" sx={{ fontSize: '3rem', fontWeight: 700, color: 'var(--foreground)', mb: 2 }}>
              Personalities
            </Typography>
            <Typography sx={{ fontSize: '1.25rem', color: 'var(--muted-foreground)', maxWidth: 672, mx: 'auto' }}>
              Discover inspiring LGBTQ+ personalities who have made significant contributions to society
            </Typography>
            {user && (
              <Box sx={{ mt: 3 }}>
                <AddPersonalityDialog onSuccess={() => window.location.reload()} />
              </Box>
            )}
          </CardContent>
        </Card>

        <Box sx={{ mb: 4 }}>
          <PersonalitiesFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />
        </Box>

        {/* Results */}
        {!loading && personalities.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, p: 2, bgcolor: 'var(--card)', borderRadius: 2, border: '1px solid var(--border)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>
                Found {personalities.length} result{personalities.length !== 1 ? 's' : ''}
              </Typography>
              {filters.search && (
                <Badge variant="secondary">
                  Searching: "{filters.search}"
                </Badge>
              )}
              {filters.profession && (
                <Badge variant="secondary">
                  Profession: "{filters.profession}"
                </Badge>
              )}
            </Box>
          </Box>
        )}

        {randomizedPersonalities.length === 0 ? (
          <Card>
            <CardContent style={{ paddingTop: 48, paddingBottom: 48 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Users style={{ height: 48, width: 48, margin: '0 auto 16px auto', display: 'block', color: 'var(--muted-foreground)' }} />
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No personalities found</Typography>
                <Typography sx={{ color: 'var(--muted-foreground)' }}>
                  Try adjusting your search criteria or filters.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 3 }}>
            {randomizedPersonalities.map((personality) => (
              <PersonalityCard
                key={personality.id}
                personality={personality}
                onClick={() => handlePersonalityClick(personality)}
              />
            ))}
          </Box>
        )}
      </Container>
    </Box>
  );
}
