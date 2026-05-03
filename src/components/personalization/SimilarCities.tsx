import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Sparkles, Shield } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
import { fetchSimilarCitiesPool, fetchSameCountryCities } from '@/hooks/useSimilarCities';

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
      if (countryId) {
        const [sameCountry, otherCities] = await Promise.all([
          fetchSameCountryCities(countryId, cityId),
          fetchSimilarCitiesPool(cityId, limit * 3),
        ]);
        const all = [...sameCountry, ...otherCities];
        return all
          .filter((c, i, arr) => arr.findIndex((a) => a.id === c.id) === i)
          .map((c) => {
            let score = 0;
            if (equalityScore != null && c.countries?.equality_score != null) {
              const diff = Math.abs(equalityScore - c.countries.equality_score);
              if (diff <= 15) score += 3;
              else if (diff <= 30) score += 1;
            }
            if (c.country_id === countryId) score += 4;
            return {
              ...c,
              country_name: c.countries?.name || '',
              eq_score: c.countries?.equality_score,
              similarity: score,
            };
          })
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);
      }

      const data = await fetchSimilarCitiesPool(cityId, limit * 3);
      return data.slice(0, limit).map((c) => ({
        ...c,
        country_name: c.countries?.name || '',
        eq_score: c.countries?.equality_score,
        similarity: 0,
      }));
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
