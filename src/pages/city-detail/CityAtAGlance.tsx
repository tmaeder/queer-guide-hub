import { useTranslation } from 'react-i18next';
import { FactGrid, type Fact } from '@/components/transit/FactGrid';
import type { CityRelation } from './types';
import { formatPopulation } from './types';

export interface CityAtAGlanceProps {
  city: CityRelation;
  hasAirport: boolean;
  effectiveIata: string | null;
}

/**
 * Spec module 01 — the fact strip.
 *
 * The safety verdict that used to sit above this grid now lives in
 * `GeoSafetyVerdict` (`src/components/geo/GeoSafetyBlock.tsx`), shared with the
 * country and village singles so all three state legal risk identically. The
 * reasoning that kept it OUT of the grid still holds and is why it did not
 * simply become another cell here: the strip renders every cell with equal
 * weight, which is right for population and currency and wrong for
 * "Criminalized" — flattening a legal verdict into a row of trivia is exactly
 * how a reader skims past it.
 *
 * `lgbt_friendly_rating` is no longer a cell: it is populated on 2.8% of live
 * cities, and a 1-5 score with no visible basis next to a real legal verdict
 * invites the reader to average the two.
 */
export function CityAtAGlance({ city, hasAirport, effectiveIata }: CityAtAGlanceProps) {
  const { t } = useTranslation();

  const facts: Fact[] = [];
  if (city.population)
    facts.push({
      label: t('cities.detail.glance.population', 'Population'),
      value: formatPopulation(city.population),
    });
  if (city.local_language)
    facts.push({
      label: t('cities.detail.glance.language', 'Language'),
      value: city.local_language,
    });
  if (city.countries?.currency)
    facts.push({
      label: t('cities.detail.glance.currency', 'Currency'),
      value: city.countries.currency,
    });
  if (city.timezone)
    facts.push({ label: t('cities.detail.about.timezone', 'Timezone'), value: city.timezone });
  // Essen has no airport of its own, but DUS is 25 km away and DTM 35 — so the
  // row used to read "AIRPORT DUS", which asserts something false about Essen.
  // `local_airport_codes` is the partition that tells the two apart (filled by
  // run_city_airport_link from the airport's own municipality). `hasAirport` is
  // the fallback for rows the partition has not reached, and for the ~800
  // cities that have no candidate at all.
  const localCodes: string[] = Array.isArray(city.local_airport_codes)
    ? city.local_airport_codes
    : [];
  // PostgREST serialises `numeric` as a STRING, so this must not test for a
  // number — `nearest_airport_km` arrives as "25.2".
  const parsedKm = Number(city.nearest_airport_km);
  const nearestKm: number | null =
    city.nearest_airport_km != null && Number.isFinite(parsedKm) ? parsedKm : null;
  const nearestCodes: string[] = Array.isArray(city.nearest_airport_codes)
    ? city.nearest_airport_codes
    : [];
  // Essen's partition is {local: none, nearest: DUS,DTM,NRN} — so an EMPTY
  // local list is a real answer, not a missing one, and testing `localCodes`
  // alone would fall through to `hasAirport` and call DUS Essen's airport
  // again. Presence of either side is what says the partition has been computed.
  const partitionKnown = localCodes.length > 0 || nearestCodes.length > 0;
  const isLocalAirport = partitionKnown
    ? !!effectiveIata && localCodes.includes(effectiveIata)
    : hasAirport;

  if (effectiveIata)
    facts.push(
      isLocalAirport
        ? { label: t('cities.detail.glance.airport', 'Airport'), value: effectiveIata }
        : {
            label: t('cities.detail.glance.nearestAirport', 'Nearest airport'),
            // "~" is the fallback when we know the airport is elsewhere but not
            // how far — a distance is the more useful statement when we have it.
            value: nearestKm != null ? `${effectiveIata} · ${Math.round(nearestKm)} km` : `~${effectiveIata}`,
          },
    );

  return <FactGrid facts={facts} />;
}
