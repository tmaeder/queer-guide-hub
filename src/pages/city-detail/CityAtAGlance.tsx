import { useTranslation } from 'react-i18next';
import { FactGrid, type Fact } from '@/components/transit/FactGrid';
import type { CityRelation } from './types';
import { formatPopulation } from './types';
import { localAirportCodes } from './cityAirports';

export interface CityAtAGlanceProps {
  city: CityRelation;
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
export function CityAtAGlance({ city }: CityAtAGlanceProps) {
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
  // "Airport" answers ONE question: does this city have an airport of its
  // own? `local_airport_codes` is that answer (run_city_airport_link fills it
  // from the airport's own municipality). Aachen has none — the airport called
  // "Maastricht Aachen" sits in the Netherlands — so it reads "No", and the
  // airports that serve it are listed with distances in the travel section
  // (`city_nearest_airports`). This cell used to say "Nearest airport DUS",
  // which repeated the travel section and, for a border city, named the wrong
  // airport because the linker only looks inside the city's own country.
  //
  // A city with no coordinates was never measured, so it gets no cell rather
  // than a "No" that could be false.
  const localCodes = localAirportCodes(city);
  if (localCodes.length > 0)
    facts.push({
      label: t('cities.detail.glance.airport', 'Airport'),
      value: localCodes.join(', '),
    });
  else if (city.latitude != null && city.longitude != null)
    facts.push({
      label: t('cities.detail.glance.airport', 'Airport'),
      value: t('cities.detail.travel.noAirport', 'No'),
    });

  return <FactGrid facts={facts} />;
}
