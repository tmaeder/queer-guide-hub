import { useQuery } from '@tanstack/react-query';
import { Sparkles, TrendingUp, Shield } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonCrossfade } from '@/components/effects';
import { useAuth } from '@/hooks/useAuth';
import { useRecommendations } from '@/hooks/useRecommendations';
import {
  fetchPersonalizedCitiesByIds,
  fetchTrendingCities,
} from '@/hooks/usePersonalizedCities';

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

  const cityIds = (recommendations || [])
    .filter((r) => r.entity_type === 'city')
    .map((r) => r.entity_id);

  const { data: cities, isLoading: citiesLoading } = useQuery({
    queryKey: ['rec-cities', cityIds],
    queryFn: async (): Promise<CityRec[]> => {
      const data = await fetchPersonalizedCitiesByIds(cityIds);
      return data
        .map((city) => {
          const rec = recommendations!.find((r) => r.entity_id === city.id);
          return {
            id: city.id,
            name: city.name,
            country_name: city.countries?.name || '',
            equality_score: city.countries?.equality_score ?? null,
            population: city.population,
            reason: rec?.reason || 'trending',
            score: rec?.score || 0,
          };
        })
        .sort((a, b) => b.score - a.score);
    },
    enabled: cityIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: trendingCities, isLoading: trendingLoading } = useQuery({
    queryKey: ['trending-cities'],
    queryFn: async (): Promise<CityRec[]> => {
      const data = await fetchTrendingCities();
      return data.map((city) => ({
        id: city.id,
        name: city.name,
        country_name: city.countries?.name || '',
        equality_score: city.countries?.equality_score ?? null,
        population: city.population,
        reason: 'trending',
        score: 0,
      }));
    },
    enabled: cityIds.length === 0 && !recsLoading,
    staleTime: 30 * 60 * 1000,
  });

  const isLoading = recsLoading || citiesLoading || trendingLoading;
  const displayCities = (cities && cities.length > 0) ? cities : (trendingCities || []);
  const isPersonalized = cities && cities.length > 0;

  if (displayCities.length === 0 && !isLoading) return null;

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
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        {isPersonalized ? (
          <Sparkles style={{ height: 20, width: 20, color: 'var(--primary)' }} />
        ) : (
          <TrendingUp style={{ height: 20, width: 20, color: 'var(--primary)' }} />
        )}
        <h6 className="font-bold" style={{ fontSize: '1.1rem' }}>
          {isPersonalized ? 'Recommended for You' : 'Popular Destinations'}
        </h6>
        {!user && isPersonalized === false && (
          <span className="text-xs text-muted-foreground ml-auto">
            Sign in for personalized picks
          </span>
        )}
      </div>

      <SkeletonCrossfade
        loading={isLoading}
        skeleton={
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={100} />)}
          </div>
        }
      >
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {displayCities.map((city) => (
          <LocalizedLink key={city.id} to={`/city/${city.id}`} style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-md transition-shadow h-full">
              <CardContent style={{ padding: 16 }}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold" style={{ fontSize: '0.95rem' }}>{city.name}</p>
                    <p className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>{city.country_name}</p>
                  </div>
                  {city.equality_score != null && (
                    <div className="flex items-center gap-1">
                      <Shield
                        style={{
                          height: 14, width: 14,
                          color: city.equality_score >= 70 ? 'var(--success)' : city.equality_score >= 40 ? 'var(--warning)' : 'var(--destructive)',
                        }}
                      />
                      <span className="font-semibold" style={{ fontSize: '0.7rem' }}>{city.equality_score}</span>
                    </div>
                  )}
                </div>
                {city.reason !== 'trending' && (
                  <Badge variant="outline">
                    {reasonLabels[city.reason] || city.reason}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </LocalizedLink>
        ))}
      </div>
      </SkeletonCrossfade>
    </div>
  );
}
