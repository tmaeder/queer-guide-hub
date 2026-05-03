import { useQuery } from '@tanstack/react-query';
import { Sparkles, Shield } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
      <div className="flex flex-row items-center gap-2 mb-3">
        <Sparkles style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <p className="font-semibold" style={{ fontSize: '0.95rem' }}>
          You might also like
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {cities.map((city) => (
          <LocalizedLink key={city.id} to={`/city/${city.id}`} style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent style={{ padding: 12 }}>
                <div className="flex flex-row justify-between items-center">
                  <div>
                    <p className="font-semibold text-sm">{city.name}</p>
                    <p className="text-muted-foreground" style={{ fontSize: '0.7rem' }}>{city.country_name}</p>
                  </div>
                  {city.eq_score != null && (
                    <div className="flex flex-row items-center gap-0.5">
                      <Shield style={{
                        height: 12, width: 12,
                        color: city.eq_score >= 70 ? 'var(--success)' : city.eq_score >= 40 ? 'var(--warning)' : 'var(--destructive)',
                      }} />
                      <p className="font-semibold" style={{ fontSize: '0.65rem' }}>{city.eq_score}</p>
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
