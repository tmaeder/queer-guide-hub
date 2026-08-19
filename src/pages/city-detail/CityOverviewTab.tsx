import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FactGrid, type Fact } from '@/components/transit/FactGrid';
import { WeatherForecast } from '@/components/weather/WeatherForecast';
import type { CityRelation } from './types';

export interface CityOverviewTabProps {
  city: CityRelation;
}

/**
 * "About the city" — the description plus the encyclopaedic facts the masthead
 * does not already carry.
 *
 * SIX blocks were deleted from this component in the subway rebuild, and the
 * reason is measurement, not taste. Against production `cities` (3,070 live
 * rows) these columns are populated at:
 *
 *   notable_landmarks 0.0%   demographics 0.0%   economy_sectors 0.0%
 *   best_time_to_visit 0.0%  local_customs 0.2%  climate_type 3.1%
 *
 * Each had a dedicated heading and chip cluster here, so on essentially every
 * city page they rendered nothing while the code implied a section existed.
 * Spec rule 2: "a module with no data does not render. No empty shells, no
 * coming soon, no zero states pretending to be content." Restore a block here
 * only when its column is actually filled — not because the field exists.
 *
 * `cost_of_living` is the one jsonb kept, and it renders EVERY key including
 * `scope` ("Country-level estimate, not city-specific"). That string is the
 * honesty guard: the value is derived from the country's GDP per capita, not
 * from city data, and cherry-picking `.band` would silently upgrade a
 * country-level estimate into a claim about this city.
 */
export function CityOverviewTab({ city }: CityOverviewTabProps) {
  const { t } = useTranslation();

  const facts: Fact[] = [];
  const civicStatus = city.is_capital
    ? t('cities.detail.about.capital', 'Capital city')
    : city.is_major_city
      ? t('cities.detail.about.majorCity', 'Major city')
      : null;
  if (civicStatus)
    facts.push({ label: t('cities.detail.about.status', 'Status'), value: civicStatus });
  if (city.region_name)
    facts.push({ label: t('cities.detail.about.region', 'Region'), value: city.region_name });
  if (city.timezone)
    facts.push({ label: t('cities.detail.about.timezone', 'Timezone'), value: city.timezone });
  if (city.founded_year)
    facts.push({
      label: t('cities.detail.about.founded', 'Founded'),
      value: String(city.founded_year),
    });
  if (city.area_km2)
    facts.push({ label: t('cities.detail.about.area', 'Area'), value: `${city.area_km2} km²` });
  if (city.elevation_m)
    facts.push({
      label: t('cities.detail.about.elevation', 'Elevation'),
      value: `${city.elevation_m} m`,
    });
  if (city.mayor) facts.push({ label: t('cities.detail.about.mayor', 'Mayor'), value: city.mayor });
  if (city.postal_codes?.length)
    facts.push({
      label: t('cities.detail.about.postalCodes', 'Postal codes'),
      value: city.postal_codes.slice(0, 4).join(', '),
    });

  const costOfLiving: [string, unknown][] = city.cost_of_living
    ? Object.entries(city.cost_of_living)
    : [];
  const universities: string[] = city.universities ?? [];
  const sisterCities: string[] = city.sister_cities ?? [];

  return (
    <div className="flex flex-col gap-8">
      {city.description && (
        <p className="max-w-reading text-body-lg leading-relaxed">{city.description}</p>
      )}

      <FactGrid facts={facts} />

      {costOfLiving.length > 0 && (
        <div>
          <h3 className="text-title font-bold">
            {t('cities.detail.about.costOfLiving', 'Cost of living')}
          </h3>
          <dl className="mt-2 bg-muted rounded-element">
            {costOfLiving.map(([key, value]) => (
              <div
                key={key}
                className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border-hairline px-4 py-2 last:border-b-0"
              >
                <dt className="text-13 capitalize text-muted-foreground">
                  {key.replace(/_/g, ' ')}
                </dt>
                <dd className="m-0 text-13 font-bold">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <ChipList
        heading={t('cities.detail.about.universities', 'Universities')}
        items={universities}
      />
      <ChipList
        heading={t('cities.detail.about.sisterCities', 'Sister cities')}
        items={sisterCities}
      />

      {typeof city.latitude === 'number' && typeof city.longitude === 'number' && (
        <WeatherForecast latitude={city.latitude} longitude={city.longitude} cityName={city.name} />
      )}
    </div>
  );
}

function ChipList({ heading, items }: { heading: string; items: string[] }): ReactNode {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-title font-bold">{heading}</h3>
      <ul className="mt-2 flex list-none flex-wrap gap-2 p-0">
        {items.map((item) => (
          <li key={item} className="bg-muted rounded-element px-2 py-1 text-13 font-bold">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
