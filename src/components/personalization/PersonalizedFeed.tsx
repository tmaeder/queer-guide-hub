import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Sparkles, TrendingUp, Shield } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useRecommendations } from '@/hooks/useRecommendations';
import { supabase } from '@/integrations/supabase/client';

interface CityRec {
  id: string;
  name: string;
  country_name: string;
  equality_score: number | null;
  population: number | null;
  reason: string;
  score: number;
}

export function PersonalizedFeed() {
  const { user } = useAuth();
  const { data: recommendations, isLoading: recsLoading } = useRecommendations({
    recType: 'destination',
    limit: 6,
  });

  // Resolve city IDs to full city data
  const cityIds = (recommendations || [])
    .filter((r) => r.entity_type === 'city')
    .map((r) => r.entity_id);

  const { data: cities, isLoading: citiesLoading } = useQuery({
    queryKey: ['rec-cities', cityIds],
    queryFn: async (): Promise<CityRec[]> => {
      if (cityIds.length === 0) return [];
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, population, countries:country_id(name, equality_score)')
        .in('id', cityIds);

      if (error || !data) return [];

      return data.map((city) => {
        const rec = recommendations!.find((r) => r.entity_id === city.id);
        const country = city.countries as { name: string; equality_score: number | null } | null;
        return {
          id: city.id,
          name: city.name,
          country_name: country?.name || '',
          equality_score: country?.equality_score ?? null,
          population: city.population,
          reason: rec?.reason || 'trending',
          score: rec?.score || 0,
        };
      }).sort((a, b) => b.score - a.score);
    },
    enabled: cityIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Fallback: show trending cities when no personalized recs
  const { data: trendingCities, isLoading: trendingLoading } = useQuery({
    queryKey: ['trending-cities'],
    queryFn: async (): Promise<CityRec[]> => {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, population, countries:country_id(name, equality_score)')
        .gte('population', 500000)
        .order('population', { ascending: false })
        .limit(6);

      if (error || !data) return [];
      return data.map((city) => {
        const country = city.countries as { name: string; equality_score: number | null } | null;
        return {
          id: city.id,
          name: city.name,
          country_name: country?.name || '',
          equality_score: country?.equality_score ?? null,
          population: city.population,
          reason: 'trending',
          score: 0,
        };
      });
    },
    enabled: cityIds.length === 0 && !recsLoading,
    staleTime: 30 * 60 * 1000,
  });

  const isLoading = recsLoading || citiesLoading || trendingLoading;
  const displayCities = (cities && cities.length > 0) ? cities : (trendingCities || []);
  const isPersonalized = cities && cities.length > 0;

  if (isLoading) {
    return (
      <Box sx={{ mb: 4 }}>
        <Skeleton variant="text" width={200} height={28} sx={{ mb: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={100} />)}
        </Box>
      </Box>
    );
  }

  if (displayCities.length === 0) return null;

  const reasonLabels: Record<string, string> = {
    favorited: 'You favorited this',
    same_country: 'Similar destination',
    country_favorited: 'In a country you like',
    trip_destination: 'From your trips',
    page_view: 'Recently viewed',
    search: 'You searched for this',
    booking_click: 'You explored booking',
    trending: 'Trending',
    below_safety_threshold: 'Safety note',
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        {isPersonalized ? (
          <Sparkles style={{ height: 20, width: 20, color: 'var(--primary)' }} />
        ) : (
          <TrendingUp style={{ height: 20, width: 20, color: 'var(--primary)' }} />
        )}
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
          {isPersonalized ? 'Recommended for You' : 'Popular Destinations'}
        </Typography>
        {!user && isPersonalized === false && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', ml: 'auto' }}>
            Sign in for personalized picks
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
          gap: 2,
        }}
      >
        {displayCities.map((city) => (
          <LocalizedLink key={city.id} to={`/city/${city.id}`} style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-md transition-shadow h-full">
              <CardContent style={{ padding: 16 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{city.name}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{city.country_name}</Typography>
                  </Box>
                  {city.equality_score != null && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Shield
                        style={{
                          height: 14, width: 14,
                          color: city.equality_score >= 70 ? 'var(--success)' : city.equality_score >= 40 ? 'var(--warning)' : 'var(--destructive)',
                        }}
                      />
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600 }}>{city.equality_score}</Typography>
                    </Box>
                  )}
                </Box>
                {city.reason !== 'trending' && (
                  <Badge variant="outline" sx={{ fontSize: '0.65rem' }}>
                    {reasonLabels[city.reason] || city.reason}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </LocalizedLink>
        ))}
      </Box>
    </Box>
  );
}
