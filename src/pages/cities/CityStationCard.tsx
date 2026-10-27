import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';
import { CityPicture } from '@/components/places/CityPicture';
import { cityPictureHasBadge } from '@/components/places/cityPictureHasBadge';
import { StationBadge } from '@/components/ui/StationBadge';
import { cityGlyph } from '@/lib/cardGlyphs';
import { CITY_NETWORKS } from '@/components/home/subway/cityNetworkGeometry';
import type { NetworkMode } from '@/components/home/subway/cityNetworkGeometry';
import { EqualityChip } from './EqualityChip';
import { formatPrideDate, type NextPride } from '@/utils/prideForCity';
import type { DirectoryCity } from '@/hooks/useCitiesDirectory';

interface CityStationCardProps {
  city: DirectoryCity;
  /** The next Pride within 90 days, if any. Comes from a separate calendar query,
   *  not from the directory row. */
  nextPride?: NextPride;
  /** True when `?city=` names this row — the station you are standing at. */
  selected?: boolean;
}

/** i18n keys for the caption under a REAL network. There is deliberately no
 *  entry for the template line — see the caption rule below. */
const NETWORK_MODE_KEY: Record<NetworkMode, { key: string; fallback: string }> = {
  subway: { key: 'cities.networkMode.subway', fallback: 'Metro network' },
  light_rail: { key: 'cities.networkMode.light_rail', fallback: 'Light rail network' },
  tram: { key: 'cities.networkMode.tram', fallback: 'Tram network' },
};

function CityStationCardImpl({ city, nextPride, selected = false }: CityStationCardProps) {
  const { t } = useTranslation();

  // A few hundred cities have a network generated from OpenStreetMap; the rest
  // draw the station plate. Reading `mode` here is what makes the difference
  // visible — see the caption below.
  const network = city.slug ? CITY_NETWORKS[city.slug] : undefined;
  const mode = network ? NETWORK_MODE_KEY[network.mode] : null;

  const countryName = city.countries?.name ?? null;
  // Country is ALWAYS rendered, never dropped for space. 38 city names in this
  // directory are ambiguous (Berlin DE vs Berlin US, Brighton twice, Wellington
  // three times) — but no two rows share a name AND a country, so the country
  // alone fully disambiguates every one of them.
  // National outranks regional and they are never both shown: a city-state like
  // Hamburg is both, and "Capital · Regional capital · Germany" reads as two
  // conflicting claims rather than one place.
  const capitalLabel = city.is_capital
    ? t('cities.capital', 'Capital')
    : city.is_regional_capital
      ? t('cities.regionalCapital', 'Regional capital')
      : null;
  const place = [capitalLabel, countryName, city.region_name].filter(Boolean).join(' · ');

  const venueLabel =
    city.venue_count > 0
      ? t('cities.venueCount', '{{count}} places', { count: city.venue_count })
      : null;
  const villageLabel =
    city.village_count > 0
      ? t('cities.villageCount', '{{count}} districts', { count: city.village_count })
      : null;

  const glyph = cityGlyph(city);
  const badge = cityPictureHasBadge(city.slug);

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-container',
        // "A card fills ink on hover or lifts — never both." The selected card is
        // already filled, so it does not lift.
        selected ? 'bg-foreground text-background' : 'bg-card shadow-soft card-lift',
      )}
      data-city-id={city.id}
    >
      <CityPicture id={city.id} slug={city.slug} name={city.name} glyph={glyph} />

      <div className={cn('flex flex-1 flex-col px-4 pb-4', badge ? '' : 'pt-4')}>
        {/* A network is a picture, so the city's mark sits on the seam; the
            station plate already carries it. */}
        {badge && <StationBadge glyph={glyph} className="-mt-8 mb-2" />}

        {/* The caption is the honesty mechanism. A real network gets its mode
            named; a city with no rail gets NOTHING, so the page never claims that
            a city with no rail has a metro. Do not add a caption for the plate. */}
        <div className="min-h-4 text-2xs font-semibold uppercase tracking-wide opacity-70">
          {mode ? t(mode.key, mode.fallback) : ''}
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <h3 className="m-0 truncate text-title font-bold leading-tight">{city.name}</h3>
          <EqualityChip score={city.countries?.equality_score} variant="ink" className="shrink-0" />
        </div>

        <p className="mt-2 truncate text-13 opacity-80">{city.editorial_hook || place}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-13">
          {city.high_risk && (
            // Stated in words, never as a hue. The four track colours on the diagram
            // above mean "line 1..4" on every card; loading a fifth meaning onto
            // colour here is exactly what the design system forbids.
            <span className="font-bold text-destructive">
              {t('cities.highRisk', 'Criminalized')}
            </span>
          )}
          {venueLabel && <span className="tabular-nums">{venueLabel}</span>}
          {villageLabel && <span className="tabular-nums opacity-70">{villageLabel}</span>}
          {nextPride && (
            <span className="tabular-nums opacity-70">
              {t('cities.pridePill', 'Pride · {{date}}', {
                date: formatPrideDate(nextPride.date),
              })}
            </span>
          )}
        </div>
      </div>

      {/* Sibling overlay, never a wrapper: an <a> around the card would put every
          chip and future action button inside an anchor (axe nested-interactive).
          `no-underline` is load-bearing — the unlayered `a` rule in index.css would
          otherwise force `position: relative` and collapse the overlay. */}
      <LocalizedLink
        to={`/city/${city.slug || city.id}`}
        aria-label={city.name}
        aria-current={selected ? 'true' : undefined}
        className="absolute inset-0 rounded-container no-underline"
      />
    </article>
  );
}

export const CityStationCard = memo(CityStationCardImpl);
