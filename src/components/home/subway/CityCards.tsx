import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Flag } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  fetchCountryCities,
  fetchTrendingCities,
  fetchPersonalizedCitiesByIds,
  fetchHomeCountries,
  fetchHomeVillages,
  fetchUpcomingHighlightCities,
  type CityHighlight,
  type PersonalizedCityRow,
  type HomePlaceRow,
} from '@/hooks/usePersonalizedCities';
import { useHomeRegionContext } from '@/components/home/homeRegionContext';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { CityPicture } from '@/components/places/CityPicture';
import { CountryMap } from '@/components/geo/CountryMap';
import { hasCountryMap } from '@/components/geo/countryMapIndex';
import { cityPictureHasBadge } from '@/components/places/cityPictureHasBadge';
import { StationBadge } from '@/components/ui/StationBadge';
import { cityGlyph } from '@/lib/cardGlyphs';
import { ROUTE_BULLET_MAP, type Track } from '@/components/transit/routeBulletMap';
import type { TransitIconName } from '@/components/transit/transitIconPaths';

import { CITY_GUIDE_COUNT, PLACE_GUIDE_COUNT, CityCardsSkeleton } from './CityCardsSkeleton';

interface Guide {
  key: string;
  name: string;
  hook: string;
  href: string;
  glyph: TransitIconName;
  track: Track;
  /** Cities fall back to their transit network when there is no photo. */
  slug: string | null;
  imageUrl: string | null;
  /** Countries without a photo fall back to their outline. */
  countryCode?: string | null;
  /** An upcoming Pride/festival that earned this city its slot. */
  highlight?: CityHighlight;
}

const todayKey = () => Math.floor(Date.now() / 86_400_000);

/** Deterministic per-day shuffle: the line-up changes daily, not per reload. */
function dailyShuffle<T>(items: T[], day = Math.floor(Date.now() / 86_400_000)): T[] {
  let seed = day;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const fromCity = (c: PersonalizedCityRow): Guide => ({
  key: `city:${c.id}`,
  name: c.name,
  hook: c.editorial_hook || c.countries?.name || '',
  href: `/city/${c.slug || c.id}`,
  glyph: cityGlyph(c),
  track: ROUTE_BULLET_MAP.city.track,
  slug: c.slug,
  imageUrl: c.image_url,
});

const fromCountry = (c: HomePlaceRow): Guide => ({
  key: `country:${c.id}`,
  name: c.name,
  hook: c.editorial_hook || '',
  href: `/country/${c.slug || c.id}`,
  glyph: 'globe',
  track: ROUTE_BULLET_MAP.country.track,
  slug: null,
  imageUrl: c.image_url,
  countryCode: c.code,
});

const fromVillage = (v: HomePlaceRow): Guide => ({
  key: `village:${v.id}`,
  name: v.name,
  hook: v.editorial_hook || v.cityName || '',
  href: `/villages/${v.slug || v.id}`,
  glyph: 'pin',
  track: ROUTE_BULLET_MAP.queer_village.track,
  slug: null,
  imageUrl: v.image_url,
});

/** City, country, city, village, … — cities keep the lead slot. Every card
 *  leads with a photo; without one, a city shows its network and a country
 *  its outline. */
function interleave(cities: Guide[], countries: Guide[], villages: Guide[]): Guide[] {
  const others: Guide[] = [];
  for (let i = 0; i < Math.max(countries.length, villages.length); i++) {
    if (countries[i]) others.push(countries[i]);
    if (villages[i]) others.push(villages[i]);
  }
  const out: Guide[] = [];
  for (let i = 0; i < Math.max(cities.length, others.length); i++) {
    if (cities[i]) out.push(cities[i]);
    if (others[i]) out.push(others[i]);
  }
  return out;
}

/** Up to two cities with an upcoming Pride/festival lead; the rest rotate daily. */
async function featuredCities(
  pool: PersonalizedCityRow[],
  highlights: Map<string, CityHighlight>,
): Promise<PersonalizedCityRow[]> {
  const boostedIds = [...highlights.keys()].slice(0, 2);
  const byId = new Map(pool.map((c) => [c.id, c]));
  const missing = boostedIds.filter((id) => !byId.has(id));
  const extra = missing.length ? await fetchPersonalizedCitiesByIds(missing).catch(() => []) : [];
  for (const c of extra) byId.set(c.id, c);
  const boosted = boostedIds.flatMap((id) => {
    const c = byId.get(id);
    return c ? [c] : [];
  });
  return [...boosted, ...dailyShuffle(pool.filter((c) => !boostedIds.includes(c.id)))];
}

async function fetchCities(
  cityId: string | null | undefined,
  countryId: string | null | undefined,
  highlights: Map<string, CityHighlight>,
) {
  // A known region keeps the cities in the visitor's country — mixing in
  // Berlin or Madrid under a Winterthur page reads as a broken filter.
  if (countryId) {
    const local = await fetchCountryCities(countryId, CITY_GUIDE_COUNT + 1);
    const home = cityId
      ? (local.find((c) => c.id === cityId) ?? (await fetchPersonalizedCitiesByIds([cityId]))[0])
      : undefined;
    const rest = local.filter((c) => c.id !== home?.id);
    const cities = home ? [home, ...rest] : rest;
    if (cities.length > 0) return cities.slice(0, CITY_GUIDE_COUNT);
  }
  const pool = await fetchTrendingCities(200000, 24);
  const home = cityId
    ? (pool.find((c) => c.id === cityId) ?? (await fetchPersonalizedCitiesByIds([cityId]))[0])
    : undefined;
  const rest = await featuredCities(
    pool.filter((c) => c.id !== home?.id),
    highlights,
  );
  return (home ? [home, ...rest.filter((c) => c.id !== home.id)] : rest).slice(0, CITY_GUIDE_COUNT);
}

export default function CityCards() {
  const { t, i18n } = useTranslation();
  const region = useHomeRegionContext();

  const {
    data: guides = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['home-destinations', 'mixed', region.cityId, region.countryId, todayKey()],
    enabled: !region.loading,
    queryFn: async () => {
      // Countries and villages are extras: if either fails, the cities still show.
      const highlights = await fetchUpcomingHighlightCities().catch(
        () => new Map<string, CityHighlight>(),
      );
      const [cities, countries, villages] = await Promise.all([
        fetchCities(region.cityId, region.countryId, highlights),
        fetchHomeCountries(PLACE_GUIDE_COUNT, region.countryId).catch(() => []),
        fetchHomeVillages(PLACE_GUIDE_COUNT, region.countryId).catch(() => []),
      ]);
      return interleave(
        cities.map((c) => ({ ...fromCity(c), highlight: highlights.get(c.id) })),
        countries.map(fromCountry),
        villages.map(fromVillage),
      );
    },
    staleTime: 30 * 60_000,
  });

  if (region.loading || isLoading) return <CityCardsSkeleton />;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isError && guides.length === 0 ? (
          <HomeSectionError
            className="sm:col-span-2 lg:col-span-4"
            retrying={isFetching}
            onRetry={() => void refetch()}
          />
        ) : guides.length === 0 ? (
          <p className="py-8 text-15 text-muted-foreground sm:col-span-2 lg:col-span-4">
            {t('home.cities.empty', 'No city guides are available right now.')}
          </p>
        ) : (
          guides.map((g) => {
            const outline = !g.imageUrl && hasCountryMap(g.countryCode);
            const badge = outline || cityPictureHasBadge(g.slug, g.imageUrl);
            return (
              <div
                key={g.key}
                className="card-lift group group/card relative flex flex-col overflow-hidden bg-card rounded-container shadow-soft"
              >
                {outline ? (
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-container-low">
                    <div className="absolute inset-0 flex items-center justify-center px-6 pt-4 pb-8">
                      <CountryMap code={g.countryCode} name={g.name} variant="thumb" />
                    </div>
                  </div>
                ) : (
                  <CityPicture
                    id={g.key}
                    slug={g.slug}
                    name={g.name}
                    glyph={g.glyph}
                    imageUrl={g.imageUrl}
                  />
                )}
                <div className={badge ? 'flow-root min-h-28 px-4 pb-4' : 'min-h-28 p-4'}>
                  {badge && (
                    <StationBadge glyph={g.glyph} hoverTrack={g.track} className="-mt-8 mb-2" />
                  )}
                  <span className="block truncate text-title font-bold leading-tight">
                    {g.name}
                  </span>
                  <div className="mt-1 truncate text-13 text-muted-foreground">{g.hook}</div>
                  {g.highlight && (
                    <span className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-badge bg-muted px-2 py-0.5 text-xs font-bold text-foreground">
                      <Flag size={12} aria-hidden className="shrink-0" />
                      <span className="truncate">
                        {g.highlight.title} ·{' '}
                        {new Date(g.highlight.startDate).toLocaleDateString(i18n.language, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </span>
                  )}
                </div>
                <LocalizedLink
                  to={g.href}
                  className="absolute inset-0 rounded-container no-underline"
                  aria-label={g.name}
                />
              </div>
            );
          })
        )}
      </div>
      {isError && guides.length > 0 && (
        <HomeSectionError stale retrying={isFetching} onRetry={() => void refetch()} />
      )}
    </>
  );
}
