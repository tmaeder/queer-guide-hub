import { Plane, Bus, ShieldAlert } from 'lucide-react';
import { hasAnyCriminalizationSignal } from '@/utils/equalityScore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CityTravelHub } from '@/components/travel/CityTravelHub';
import { SimilarCities } from '@/components/personalization/SimilarCities';
import type { CityRelation, NearestAirportType } from './types';

export interface CityTravelTabProps {
  city: CityRelation;
  effectiveIata: string | null;
  hasAirport: boolean;
  nearestAirport: NearestAirportType;
}

export function CityTravelTab({
  city,
  effectiveIata,
  hasAirport,
  nearestAirport,
}: CityTravelTabProps) {
  // High-stakes composition rule (mirrors CountryTravelTab): no deal/upsell
  // modules where LGBTQ+ people face criminal penalties.
  const highRisk = hasAnyCriminalizationSignal(city.countries?.lgbti_criminalization);
  return (
    <div className="flex flex-col gap-6">
        {highRisk ? (
          <div className="flex gap-4 rounded-container border border-destructive/40 p-6">
            <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-destructive" />
            <div className="flex flex-col gap-2">
              <p className="text-body-lg font-medium">
                We don't promote travel deals for destinations where LGBTQ+ people face criminal
                penalties.
              </p>
              <p className="text-15 text-muted-foreground">
                If you need to travel to {city.name}, read the safety &amp; rights section first and
                use the trip planner — it includes a safety briefing for high-risk destinations.
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

        <SimilarCities
          cityId={city.id}
          cityName={city.name}
          countryId={city.country_id}
          equalityScore={city.countries?.equality_score}
          latitude={city.latitude}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle style={{ alignItems: 'center' }} className="flex gap-2">
                <Plane size={20} />
                Airports
              </CardTitle>
            </CardHeader>
            <CardContent>
              {city.major_airport_code && (
                <div className="p-4 rounded-element bg-muted mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Plane size={16} />
                    <span className="text-sm font-medium">Major Airport</span>
                  </div>
                  <span className="font-bold">{city.major_airport_code}</span>
                </div>
              )}
              {!hasAirport && nearestAirport && (
                <div className="p-4 rounded-element bg-muted mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Plane size={16} />
                    <span className="text-sm font-medium">Nearest Airport</span>
                  </div>
                  <span className="font-bold">{nearestAirport.iata_code}</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {nearestAirport.city_name} — {nearestAirport.distanceKm} km away
                  </p>
                </div>
              )}
              {city.airport_codes && city.airport_codes.length > 0 && (
                <div>
                  <span className="text-sm font-medium mb-4 block">All Airport Codes</span>
                  <div className="flex flex-wrap gap-2">
                    {city.airport_codes.map((code: string, index: number) => (
                      <Badge key={index} variant="outline">
                        <Plane size={12} className="mr-1" />
                        {code}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle style={{ alignItems: 'center' }} className="flex gap-2">
                <Bus size={20} />
                Transportation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {city.transportation_info && Object.keys(city.transportation_info).length > 0 ? (
                <div className="flex flex-col gap-4">
                  {Object.entries(city.transportation_info).map(([key, value]) => (
                    <div key={key} className="p-4 rounded-element bg-muted">
                      <div className="flex items-center gap-2 mb-1">
                        <Bus size={16} className="text-muted-foreground" />
                        <span className="text-sm font-medium capitalize">
                          {key.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className="text-sm">{String(value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No transportation information available.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
    </div>
  );
}
