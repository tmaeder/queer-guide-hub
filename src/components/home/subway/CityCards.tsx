import type { TFunction } from 'i18next';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { fetchTrendingCities, fetchPersonalizedCitiesByIds } from '@/hooks/usePersonalizedCities';
import { useHomeRegionContext } from '@/components/home/homeRegionContext';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { CityPicture } from '@/components/places/CityPicture';
import { cityPictureHasBadge } from '@/components/places/cityPictureHasBadge';
import { StationBadge } from '@/components/ui/StationBadge';
import { cityGlyph } from '@/lib/cardGlyphs';
import { tierForScore, EQUALITY_TIER_LABEL } from '@/utils/equalityScore';

import { CITY_GUIDE_COUNT, CityCardsSkeleton } from './CityCardsSkeleton';

/**
 * The country's equality score, said out loud.
 *
 * Three things this has to get right, none of which a bare number did:
 *
 *  - It is LABELLED. "90" beside a city name is a figure a reader cannot
 *    calibrate; the tier word is the part that actually answers "is this
 *    place safe for me".
 *  - It is NATIONAL. This is `countries.equality_score` on a *city* card, so
 *    the accessible name says so — a liberal city inside a restrictive country
 *    must not read as if the score were its own.
 *  - It is INK. The equality scale is a sanctioned functional palette, but
 *    EqualityScoreBadge already documents that those hues fail contrast as
 *    tiny text (measured 2.27:1 for the green). The ring may carry colour;
 *    an 10px label may not.
 *
 * Renders nothing when the score is null — 11 countries genuinely have none,
 * and omitting is honest where "0" or "50" would be a false claim.
 *
 * The tier WORD only appears below `TIER_WORD_BELOW`. The curated set is all
 * rights-affirming countries, so spelling out "Very High" put the same two
 * words on all eight cards — a label that never varies is noise, and it buries
 * the one case that matters. That case is real: the visitor's own city is
 * prepended to this band with no equality filter at all, so someone in a
 * criminalising country sees it first. There the word is the whole point.
 *
 * Nothing is hidden either way — the number is always shown, and the full tier
 * is always in the card's accessible name.
 */
const TIER_WORD_BELOW = 60; // = below `high` in EQUALITY_TIER_CUTOFFS

function EqualityLine({ score }: { score: number | null | undefined }) {
  const { t } = useTranslation();
  if (score == null) return null;
  const tier = tierForScore(score);
  return (
    <div className="mt-1 truncate text-2xs uppercase tracking-label text-muted-foreground">
      {t('home.cities.equalityLabel', 'Equality')} {score}/100
      {score < TIER_WORD_BELOW && (
        <> · {t(`home.cities.equalityTier.${tier}`, EQUALITY_TIER_LABEL[tier])}</>
      )}
    </div>
  );
}

/** The card's whole-surface link is the only thing a screen reader announces,
 *  so it carries the full explainer rather than just the city name. Phrasing
 *  mirrors EqualityScoreBadge so the two cannot describe the same number
 *  differently. */
function equalityAriaLabel(name: string, score: number | null | undefined, t: TFunction): string {
  if (score == null) return name;
  return t(
    'home.cities.equalityAria',
    '{{city}} — equality score {{score}} of 100, {{tier}}. National LGBTQ+ legal climate.',
    { city: name, score, tier: EQUALITY_TIER_LABEL[tierForScore(score)] },
  );
}

export default function CityCards() {
  const { t } = useTranslation();
  const region = useHomeRegionContext();

  const {
    data: cities = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['home-destinations', region.cityId],
    enabled: !region.loading,
    queryFn: async () => {
      const trending = await fetchTrendingCities(200000, CITY_GUIDE_COUNT);
      if (!region.cityId) return trending;
      // Already in the editorial set — promote rather than fetch it twice.
      const found = trending.find((c) => c.id === region.cityId);
      if (found) return [found, ...trending.filter((c) => c.id !== region.cityId)];
      const [home] = await fetchPersonalizedCitiesByIds([region.cityId]);
      return home ? [home, ...trending].slice(0, CITY_GUIDE_COUNT) : trending;
    },
    staleTime: 30 * 60_000,
  });

  if (region.loading || isLoading) return <CityCardsSkeleton />;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isError && cities.length === 0 ? (
          <HomeSectionError
            className="sm:col-span-2 lg:col-span-4"
            retrying={isFetching}
            onRetry={() => void refetch()}
          />
        ) : cities.length === 0 ? (
          <p className="py-8 text-15 text-muted-foreground sm:col-span-2 lg:col-span-4">
            {t('home.cities.empty', 'No city guides are available right now.')}
          </p>
        ) : (
          cities.map((city) => {
            const glyph = cityGlyph(city);
            // The band is about transit, so the city's network leads even when
            // it has a photo: no imageUrl is passed on purpose.
            const badge = cityPictureHasBadge(city.slug);
            return (
              <div
                key={city.id}
                className="card-lift group group/card relative flex flex-col overflow-hidden bg-card rounded-container shadow-soft"
              >
                <CityPicture id={city.id} slug={city.slug} name={city.name} glyph={glyph} />
                <div className={badge ? 'px-4 pb-4' : 'p-4'}>
                  {badge && <StationBadge glyph={glyph} className="-mt-8 mb-2" />}
                  {/* The score's meaning lives on the footer line, not as a bare
                      number beside the name — see EqualityLine. */}
                  <span className="block truncate text-title font-bold leading-tight">
                    {city.name}
                  </span>
                  <div className="mt-1 truncate text-13 text-muted-foreground">
                    {city.editorial_hook || city.countries?.name || ''}
                  </div>
                  <EqualityLine score={city.countries?.equality_score} />
                </div>
                <LocalizedLink
                  to={`/city/${city.slug || city.id}`}
                  className="absolute inset-0 rounded-container no-underline"
                  aria-label={equalityAriaLabel(city.name, city.countries?.equality_score, t)}
                />
              </div>
            );
          })
        )}
      </div>
      {isError && cities.length > 0 && (
        <HomeSectionError stale retrying={isFetching} onRetry={() => void refetch()} />
      )}
    </>
  );
}
