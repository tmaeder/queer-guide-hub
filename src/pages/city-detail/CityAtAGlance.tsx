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
  if (effectiveIata)
    facts.push({
      label: t('cities.detail.glance.airport', 'Airport'),
      // "~" marks a NEARBY airport rather than one in this city.
      value: hasAirport ? effectiveIata : `~${effectiveIata}`,
    });

  return <FactGrid facts={facts} />;
}
