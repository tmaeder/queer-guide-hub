import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hasAnyCriminalizationSignal } from '@/utils/equalityScore';
import { FactGrid, type Fact } from '@/components/transit/FactGrid';
import { CityTravelHub } from '@/components/travel/CityTravelHub';
import { CityNetworkPanel } from '@/components/geo/CityNetworkPanel';
import type { CityRelation, NearestAirportType } from './types';

export interface CityTravelTabProps {
  city: CityRelation;
  effectiveIata: string | null;
  hasAirport: boolean;
  nearestAirport: NearestAirportType;
}

/**
 * Getting there and getting around.
 *
 * The high-stakes composition rule is unchanged and load-bearing (it mirrors
 * `CountryTravelTab`): no deal or upsell modules where LGBTQ+ people face
 * criminal penalties. That branch keeps `--destructive`, which is the only
 * token allowed to mean danger.
 *
 * The network diagram sits HERE rather than in the masthead or the rail. It is
 * the sanctioned four-track surface, and the design system forbids the four
 * wayfinding hues sharing a viewport with a risk badge — the safety verdict
 * lives at the top of the rail, so the diagram lives well below the fold, in
 * the one section where a transit map is information rather than ornament.
 */
export function CityTravelTab({
  city,
  effectiveIata,
  hasAirport,
  nearestAirport,
}: CityTravelTabProps) {
  const { t } = useTranslation();
  const highRisk = hasAnyCriminalizationSignal(city.countries?.lgbti_criminalization);

  // The head fact strip (`CityAtAGlance`) already states the airport code, so
  // this grid only carries what the strip cannot: the distance to a nearby
  // airport when the city has none of its own, and the full code list when
  // there is genuinely more than one. Repeating "Major airport: BER" one
  // section below "Airport: BER" was noise, not information.
  const airportFacts: Fact[] = [];
  // `nearest_airport_codes` holds the airports that serve this city from
  // OUTSIDE it (Essen: DUS, DTM, NRN — it has none of its own), partitioned off
  // `airport_codes` by run_city_airport_link. It is more trustworthy than the
  // `useNearestAirport` fallback below, which scans the unfiltered `airports`
  // table and will happily return a bush strip, so it wins when present.
  // PostgREST serialises `numeric` as a string; "25.2" is not a number.
  const nearestCodes: string[] = Array.isArray(city.nearest_airport_codes)
    ? city.nearest_airport_codes
    : [];
  const parsedKm = Number(city.nearest_airport_km);
  const nearestKm = Number.isFinite(parsedKm) ? Math.round(parsedKm) : null;

  if (nearestCodes.length)
    airportFacts.push({
      label: t('cities.detail.travel.nearestAirport', 'Nearest airport'),
      value: nearestKm != null ? `${nearestCodes[0]} · ${nearestKm} km` : nearestCodes[0],
    });
  else if (!hasAirport && nearestAirport?.iata_code)
    airportFacts.push({
      label: t('cities.detail.travel.nearestAirport', 'Nearest airport'),
      // The distance can be absent when the code came from the client-side
      // fallback rather than `cities.nearest_airport_km`; show the code alone
      // rather than "LGW · null km".
      value:
        nearestAirport.distanceKm != null
          ? `${nearestAirport.iata_code} · ${nearestAirport.distanceKm} km`
          : nearestAirport.iata_code,
    });
  if (nearestCodes.length > 1)
    airportFacts.push({
      label: t('cities.detail.travel.otherNearby', 'Other airports nearby'),
      value: nearestCodes.slice(1).join(', '),
    });
  if (city.airport_codes && city.airport_codes.length > 1)
    airportFacts.push({
      label: t('cities.detail.travel.allCodes', 'All airport codes'),
      value: city.airport_codes.join(', '),
    });

  const transport: [string, unknown][] = city.transportation_info
    ? Object.entries(city.transportation_info)
    : [];

  return (
    <div className="flex flex-col gap-8">
      {highRisk ? (
        <div className="border flex gap-4 border-destructive p-4 sm:p-6">
          <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-destructive" />
          <div className="flex flex-col gap-2">
            <p className="text-body-lg font-bold">
              {t(
                'cities.detail.travel.noDealsTitle',
                "We don't promote travel deals for destinations where LGBTQ+ people face criminal penalties.",
              )}
            </p>
            <p className="text-15 text-muted-foreground">
              {t(
                'cities.detail.travel.noDealsBody',
                'If you need to travel to {{city}}, read the safety and rights section first and use the trip planner — it includes a safety briefing for high-risk destinations.',
                { city: city.name },
              )}
            </p>
          </div>
        </div>
      ) : (
        <CityTravelHub
          destinationIata={effectiveIata}
          destinationCity={city.name}
          destinationCountryCode={city.countries?.code}
          equalityScore={city.countries?.equality_score}
        />
      )}

      <CityNetworkPanel
        slug={city.slug}
        linesLabel={t('cities.detail.travel.lines', 'Lines')}
        caption={t(
          'cities.detail.travel.networkCaption',
          'Rapid-transit lines, drawn from OpenStreetMap. Schematic, not to scale.',
        )}
      />

      <FactGrid facts={airportFacts} />

      {transport.length > 0 && (
        <div>
          <h3 className="text-title font-bold">
            {t('cities.detail.travel.gettingAround', 'Getting around')}
          </h3>
          <dl className="mt-2 bg-muted rounded-element">
            {transport.map(([key, value]) => (
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
    </div>
  );
}
