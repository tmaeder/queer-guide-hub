import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Sparkles, Shield } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface SimilarCitiesProps {
  cityId: string;
  cityName: string;
  countryId?: string;
  equalityScore?: number | null;
  latitude?: number | null;
  limit?: number;
}

export function SimilarCities({ cityId, _cityName, countryId, equalityScore, _latitude, limit = 6 }: SimilarCitiesProps) {
  const { data: cities, isLoading } = useQuery({
    queryKey: ['similar-cities', cityId, countryId, limit],
    queryFn: async () => {
      // Find cities with similar characteristics
      const query = supabase
        .from('cities')
        .select('id, name, population, countries:country_id(name, equality_score)')
        .neq('id', cityId)
        .gte('population', 100000)
        .order('population', { ascending: false })
        .limit(limit * 3); // Fetch extra to filter

      // Prefer same region / similar safety
      if (countryId) {
        // First try same country
        const { data: sameCountry } = await supabase
          .from('cities')
          .select('id, name, population, countries:country_id(name, equality_score)')
          .eq('country_id', countryId)
          .neq('id', cityId)
          .gte('population', 50000)
          .order('population', { ascending: false })
          .limit(3);

        const { data: otherCities } = await query;

        const all = [...(sameCountry || []), ...(otherCities || [])];

        // Score and rank
        const scored = all
          .filter((c, i, arr) => arr.findIndex((a) => a.id === c.id) === i) // dedupe
          .map((c) => {
            const country = c.countries as { name: string; equality_score: number | null } | null;
            let score = 0;
            // Similar equality score
            if (equalityScore != null && country?.equality_score != null) {
              const diff = Math.abs(equalityScore - country.equality_score);
              if (diff <= 15) score += 3;
              else if (diff <= 30) score += 1;
            }
            // Same country bonus
            if (c.country_id === countryId) score += 4;
            return { ...c, country_name: country?.name || '', eq_score: country?.equality_score, similarity: score };
          })
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        return scored;
      }

      const { data } = await query;
      return (data || []).slice(0, limit).map((c) => {
        const country = c.countries as { name: string; equality_score: number | null } | null;
        return { ...c, country_name: country?.name || '', eq_score: country?.equality_score, similarity: 0 };
      });
    },
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={200} height={24} sx={{ mb: 1 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={70} />)}
        </Box>
      </Box>
    );
  }

  if (!cities || cities.length === 0) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Sparkles style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
          You might also like
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        {cities.map((city) => (
          <LocalizedLink key={city.id} to={`/city/${city.id}`} style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent style={{ padding: 12 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{city.name}</Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{city.country_name}</Typography>
                  </Box>
                  {city.eq_score != null && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                      <Shield style={{
                        height: 12, width: 12,
                        color: city.eq_score >= 70 ? 'var(--success)' : city.eq_score >= 40 ? 'var(--warning)' : 'var(--destructive)',
                      }} />
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 600 }}>{city.eq_score}</Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </LocalizedLink>
        ))}
      </Box>
    </Box>
  );
}
