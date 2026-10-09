import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hasAnyCriminalizationSignal } from '@/utils/equalityScore';
import { FactGrid, type Fact } from '@/components/transit/FactGrid';
import { CityTravelHub } from '@/components/travel/CityTravelHub';
import { CityNetworkPanel } from '@/components/geo/CityNetworkPanel';
import type { CityRelation } from './types';
import { useCityNearestAirports } from '@/hooks/useCityNearestAirports';

export interface CityTravelTabProps {
  city: CityRelation;
  /** Flight-search target (`major_airport_code` or fallback). Booking only. */
  effectiveIata: string | null;
}

/** PostgREST serialises `numeric` as a string; "26.6" is not a number. */
function formatKm(km: number | string | null | undefined): string | null {
  const n = Number(km);
  return km != null && km !== '' && Number.isFinite(n) ? `${Math.round(n)} km` : null;
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
export function CityTravelTab({ city, effectiveIata }: CityTravelTabProps) {
  const { t } = useTranslation();
  const highRisk = hasAnyCriminalizationSignal(city.countries?.lgbti_criminalization);

  // Only "Nearest airports" lives here: up to three, code · city · km,
  // measured from this city and across borders (`city_nearest_airports`).
  // Whether the city has an airport of its OWN ("Airport: CGN" / "No") is
  // stated once, in the head fact strip (`CityAtAGlance`). The page used to
  // repeat the airport up to five times — the head strip, "Nearest airport",
  // "Other airports nearby", "All airport codes", and the `airports` line of
  // transportation_info under "Getting around".
  const hasCoords = city.latitude != null && city.longitude != null;
  const { data: nearest = [] } = useCityNearestAirports(hasCoords ? city.id : null);

  const airportFacts: Fact[] = [];
  if (nearest.length > 0)
    airportFacts.push({
      label: t('cities.detail.travel.nearestAirports', 'Nearest airports'),
      value: (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {nearest.map((ap) => (
            <li key={ap.iata_code} title={ap.airport_name}>
              {[ap.iata_code, ap.city, formatKm(ap.distance_km)].filter(Boolean).join(' · ')}
            </li>
          ))}
        </ul>
      ),
    });

  // `airports` is written into transportation_info by the airport linker for
  // the booking context; the head strip and the nearest list already state it, so it is not
  // repeated under "Getting around".
  const transport: [string, unknown][] = city.transportation_info
    ? Object.entries(city.transportation_info).filter(([key]) => key !== 'airports')
    : [];

  return (
    <div className="flex flex-col gap-8">
      {highRisk ? (
        <div className="flex gap-4 rounded-container bg-destructive/10 p-4 shadow-soft sm:p-6">
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
