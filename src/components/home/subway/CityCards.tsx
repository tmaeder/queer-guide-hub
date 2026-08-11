import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { fetchTrendingCities } from '@/hooks/usePersonalizedCities';
import type { Track } from '@/components/transit/routeBulletMap';
import { PageContainer } from '@/components/layout/PageContainer';

/** Per-card bending line — four precomputed paths cycled by index so
 *  neighbouring cards never bend the same way (template geometry). */
const CITY_LINES = [
  'M 6 20 C 40 12 70 24 100 17 C 130 10 165 22 194 15',
  'M 6 18 C 38 24 72 12 100 17 C 135 22 160 10 194 16',
  'M 6 14 C 45 22 80 10 100 17 C 125 24 170 12 194 18',
  'M 6 16 C 42 10 76 24 100 17 C 128 12 166 22 194 14',
];
const TRACK_ORDER: Track[] = ['pink', 'green', 'blue', 'yellow'];
const TRACK_VAR: Record<Track, string> = {
  pink: 'var(--track-pink)',
  blue: 'var(--track-blue)',
  green: 'var(--track-green)',
  yellow: 'var(--track-yellow)',
};

/** "Where are you riding?" — city cards with a bending track line each.
 *  Replaces the photo-rail destinations section. */
export function CityCards() {
  const { t } = useTranslation();
  const { data: cities = [], isLoading } = useQuery({
    queryKey: ['home-destinations'],
    queryFn: () => fetchTrendingCities(200000, 8),
    staleTime: 30 * 60_000,
  });

  if (!isLoading && cities.length === 0) return null;

  return (
    <section className="border-b-4 border-foreground">
      <PageContainer>
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-display">
            {t('home.cities.title', 'Where are you riding?')}
          </h2>
          <LocalizedLink to="/cities" className="text-15 font-bold no-underline">
            {t('home.cities.seeAll', 'All cities')} →
          </LocalizedLink>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse border-[3px] border-foreground/20" />
              ))
            : cities.map((city, i) => (
                <div
                  key={city.id}
                  className="card-lift group relative border-[3px] border-foreground bg-background p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-display text-headline">{city.name}</span>
                    {city.countries?.equality_score != null && (
                      <span
                        className="shrink-0 text-13 font-bold"
                        title={t('home.cities.equality', 'Equality score')}
                      >
                        {city.countries.equality_score}
                      </span>
                    )}
                  </div>
                  <svg viewBox="0 0 200 34" className="my-2 w-full" aria-hidden>
                    <path
                      d={CITY_LINES[i % CITY_LINES.length]}
                      fill="none"
                      stroke={`hsl(${TRACK_VAR[TRACK_ORDER[i % TRACK_ORDER.length]]})`}
                      strokeWidth={6}
                      strokeLinecap="round"
                    />
                    <circle
                      cx={100}
                      cy={17}
                      r={6}
                      fill="hsl(var(--background))"
                      stroke="hsl(var(--foreground))"
                      strokeWidth={3}
                    />
                  </svg>
                  <div className="truncate text-13 text-muted-foreground">
                    {city.editorial_hook || city.countries?.name || ''}
                  </div>
                  <LocalizedLink
                    to={`/city/${city.slug || city.id}`}
                    className="absolute inset-0 no-underline"
                    aria-label={city.name}
                  />
                </div>
              ))}
        </div>
      </PageContainer>
    </section>
  );
}
