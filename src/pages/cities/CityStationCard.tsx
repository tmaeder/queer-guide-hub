import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';
import { CityNetwork } from '@/components/home/subway/CityNetwork';
import { templateIndexFor } from '@/components/home/subway/templateIndex';
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

  // 22 of the 2,142 cities have a network generated from OpenStreetMap; the rest
  // fall back to a template line. Reading `mode` here is what makes the difference
  // visible — see the caption below.
  const network = city.slug ? CITY_NETWORKS[city.slug] : undefined;
  const mode = network ? NETWORK_MODE_KEY[network.mode] : null;

  const countryName = city.countries?.name ?? null;
  // Country is ALWAYS rendered, never dropped for space. 38 city names in this
  // directory are ambiguous (Berlin DE vs Berlin US, Brighton twice, Wellington
  // three times) — but no two rows share a name AND a country, so the country
  // alone fully disambiguates every one of them.
  const place = [
    city.is_capital ? t('cities.capital', 'Capital') : null,
    countryName,
    city.region_name,
  ]
    .filter(Boolean)
    .join(' · ');

  const venueLabel =
    city.venue_count > 0
      ? t('cities.venueCount', '{{count}} places', { count: city.venue_count })
      : null;
  const villageLabel =
    city.village_count > 0
      ? t('cities.villageCount', '{{count}} districts', { count: city.village_count })
      : null;

  return (
    <article
      className={cn(
        'group relative flex flex-col border-[3px] border-foreground p-4',
        // "A card fills ink on hover or lifts with the hard shadow — never both."
        // The selected card is already filled, so it does not lift.
        selected ? 'bg-foreground text-background' : 'bg-background card-lift',
      )}
      data-city-id={city.id}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 truncate font-display text-headline">{city.name}</h3>
        <EqualityChip score={city.countries?.equality_score} variant="ink" className="shrink-0" />
      </div>

      {/* Decorative even though it is the card's largest element: the card already
          carries the city's name as text, and a screen-reader user gains nothing
          from a description of an abstracted rail diagram. */}
      <CityNetwork slug={city.slug} index={templateIndexFor(city.slug)} />

      {/* The caption is the honesty mechanism. A real network gets its mode named;
          a template line gets NOTHING, so the page never claims that a city with
          no rail has a metro. The absence is the signal — do not add a caption for
          the fallback. */}
      <div className="min-h-4 text-2xs uppercase tracking-label opacity-70">
        {mode ? t(mode.key, mode.fallback) : ''}
      </div>

      <p className="mt-2 truncate text-13 opacity-80">{city.editorial_hook || place}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-13">
        {city.high_risk && (
          // Stated in words, never as a hue. The four track colours on the diagram
          // above mean "line 1..4" on every card; loading a fifth meaning onto
          // colour here is exactly what the design system forbids.
          <span className="font-bold text-destructive">{t('cities.highRisk', 'Criminalized')}</span>
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

      {/* Sibling overlay, never a wrapper: an <a> around the card would put every
          chip and future action button inside an anchor (axe nested-interactive).
          `no-underline` is load-bearing — the unlayered `a` rule in index.css would
          otherwise force `position: relative` and collapse the overlay. */}
      <LocalizedLink
        to={`/city/${city.slug || city.id}`}
        aria-label={city.name}
        aria-current={selected ? 'true' : undefined}
        className="absolute inset-0 no-underline"
      />
    </article>
  );
}

export const CityStationCard = memo(CityStationCardImpl);
