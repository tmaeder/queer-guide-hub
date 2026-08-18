import type { TFunction } from 'i18next';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { fetchTrendingCities, fetchPersonalizedCitiesByIds } from '@/hooks/usePersonalizedCities';
import { Band } from '@/components/home/Band';
import { useHomeRegionContext } from '@/components/home/homeRegionContext';
import { CityNetwork } from './CityNetwork';
import { NETWORK_VIEWBOX } from './cityNetworkGeometry';
import { tierForScore, EQUALITY_TIER_LABEL } from '@/utils/equalityScore';

const CARDS = 8;

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

/** "Where are you riding?" — city cards, each carrying an octilinear
 *  abstraction of that city's own transit network.
 *
 *  The visitor's own city leads when we know it, then the editorial set. The
 *  band used to render the same fixed whitelist in the same order for every
 *  visitor forever, which made "where are you riding" a question it never
 *  actually asked. It still never self-hides — the homepage e2e asserts this
 *  heading is present, because a self-hiding band and a broken query look
 *  identical. */
export function CityCards() {
  const { t } = useTranslation();
  const region = useHomeRegionContext();

  const { data: cities = [], isLoading } = useQuery({
    queryKey: ['home-destinations', region.cityId],
    enabled: !region.loading,
    queryFn: async () => {
      const trending = await fetchTrendingCities(200000, CARDS);
      if (!region.cityId) return trending;
      // Already in the editorial set — promote rather than fetch it twice.
      const found = trending.find((c) => c.id === region.cityId);
      if (found) return [found, ...trending.filter((c) => c.id !== region.cityId)];
      const [home] = await fetchPersonalizedCitiesByIds([region.cityId]);
      return home ? [home, ...trending].slice(0, CARDS) : trending;
    },
    staleTime: 30 * 60_000,
  });

  return (
    <Band
      surface="tint"
      title={t('home.cities.title', 'Where are you riding?')}
      seeAllHref="/cities"
      seeAllLabel={t('home.cities.seeAll', 'All cities')}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              // Same shell + an empty diagram box, so the skeleton is exactly
              // as tall as the loaded card at every breakpoint instead of a
              // fixed height that only matches at one.
              <div key={i} className="border animate-pulse border-foreground/20 p-4">
                <div className="h-8 w-2/3 bg-muted" />
                <svg
                  viewBox={`0 0 ${NETWORK_VIEWBOX.w} ${NETWORK_VIEWBOX.h}`}
                  className="my-2 w-full"
                  aria-hidden
                />
                <div className="h-4 w-1/2 bg-muted" />
              </div>
            ))
          : cities.map((city, i) => (
              <div
                key={city.id}
                className="card-lift group relative bg-card p-4 rounded-container shadow-soft"
              >
                {/* The name owns the row now. The score used to sit here as a
                      bare "90" with only a hover title — a number a reader
                      cannot calibrate, on a metric that is safety-adjacent.
                      EqualityScoreBadge learned the same lesson in 2026-07
                      ("every size now carries its meaning"); it is a 48-88px
                      ring, too big for this card, so the meaning moves to the
                      footer line instead. */}
                <span className="block truncate font-display text-headline">{city.name}</span>
                <CityNetwork slug={city.slug} index={i} />
                <div className="truncate text-13 text-muted-foreground">
                  {city.editorial_hook || city.countries?.name || ''}
                </div>
                <EqualityLine score={city.countries?.equality_score} />
                <LocalizedLink
                  to={`/city/${city.slug || city.id}`}
                  className="absolute inset-0 no-underline"
                  aria-label={equalityAriaLabel(city.name, city.countries?.equality_score, t)}
                />
              </div>
            ))}
      </div>
    </Band>
  );
}
