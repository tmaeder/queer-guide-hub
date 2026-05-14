import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
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
      <div>
        <Skeleton className="h-6 w-[200px] mb-2" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[70px] rounded" />)}
        </div>
      </div>
    );
  }

  if (!cities || cities.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <p className="font-semibold text-[0.95rem]">
          You might also like
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {cities.map((city) => (
          <LocalizedLink key={city.id} to={`/city/${city.id}`} style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent style={{ padding: 12 }}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-sm">{city.name}</p>
                    <p className="text-[0.7rem] text-muted-foreground">{city.country_name}</p>
                  </div>
                  {city.eq_score != null && (
                    <div className="flex items-center gap-0.5">
                      <Shield style={{
                        height: 12, width: 12,
                        color: city.eq_score >= 70 ? 'var(--success)' : city.eq_score >= 40 ? 'var(--warning)' : 'var(--destructive)',
                      }} />
                      <span className="text-[0.65rem] font-semibold">{city.eq_score}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </LocalizedLink>
        ))}
      </div>
    </div>
  );
}
