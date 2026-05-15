import { Plane, Bus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CityTravelHub } from '@/components/travel/CityTravelHub';
import { SimilarCities } from '@/components/personalization/SimilarCities';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
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
  return (
    <ScrollReveal direction="up">
    <div className="flex flex-col gap-6 mt-6">
      <CityTravelHub
        destinationIata={effectiveIata}
        destinationCity={city.name}
        destinationCountryCode={city.countries?.code}
        equalityScore={city.countries?.equality_score}
      />

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
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plane style={{ height: 20, width: 20 }} />
              Airports
            </CardTitle>
          </CardHeader>
          <CardContent>
            {city.major_airport_code && (
              <div className="p-3 rounded-element bg-muted mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Plane style={{ height: 16, width: 16 }} />
                  <span className="text-sm font-medium">Major Airport</span>
                </div>
                <span className="font-bold">{city.major_airport_code}</span>
              </div>
            )}
            {!hasAirport && nearestAirport && (
              <div className="p-3 rounded-element bg-muted mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Plane style={{ height: 16, width: 16 }} />
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
                <span className="text-sm font-medium mb-3 block">All Airport Codes</span>
                <div className="flex flex-wrap gap-2">
                  {city.airport_codes.map((code: string, index: number) => (
                    <Badge key={index} variant="outline">
                      <Plane style={{ height: 12, width: 12, marginRight: 4 }} />
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
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bus style={{ height: 20, width: 20 }} />
              Transportation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {city.transportation_info && Object.keys(city.transportation_info).length > 0 ? (
              <div className="flex flex-col gap-3">
                {Object.entries(city.transportation_info).map(([key, value]) => (
                  <div key={key} className="p-3 rounded-element bg-muted">
                    <div className="flex items-center gap-2 mb-1">
                      <Bus style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
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
    </ScrollReveal>
  );
}
