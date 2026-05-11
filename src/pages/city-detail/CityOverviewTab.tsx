import type { ReactNode } from 'react';
import {
  MapPin,
  Globe,
  Users,
  Calendar,
  Star,
  Clock,
  Thermometer,
  Mountain,
  Phone,
  Plane,
  DollarSign,
  GraduationCap,
  Landmark,
  Info,
  Home,
  ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { VillageCard } from '@/components/villages/VillageCard';
import { WeatherForecast } from '@/components/weather/WeatherForecast';
import { LocationInfo } from '@/components/location/LocationInfo';
import type { CityRelation, VillageRelation, NearestAirportType } from './types';

export interface CityOverviewTabProps {
  city: CityRelation;
  villages: VillageRelation[];
  villagesLoading: boolean;
  hasAirport: boolean;
  effectiveIata: string | null;
  nearestAirport: NearestAirportType;
}

interface FactRowProps {
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  label: string;
  value: ReactNode;
  valueSize?: string;
}

function FactRow({ icon: Icon, label, value, valueSize }: FactRowProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
      <div className="flex items-center gap-2">
        <Icon style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="font-bold" style={valueSize ? { fontSize: valueSize } : undefined}>
        {value}
      </span>
    </div>
  );
}

export function CityOverviewTab({
  city,
  villages,
  villagesLoading,
  hasAirport,
  effectiveIata,
  nearestAirport,
}: CityOverviewTabProps) {
  return (
    <div className="flex flex-col gap-6 mt-6">
      <ScrollReveal direction="up">
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6">
          <Card>
            <CardHeader>
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Globe style={{ height: 20, width: 20 }} />
                About {city.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground" style={{ lineHeight: 1.7 }}>
                {city.description ||
                  `Discover ${city.name} – from local venues and cultural landmarks to upcoming events.`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Star style={{ height: 20, width: 20 }} />
                Quick Facts
              </CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {city.countries?.name && (
                <FactRow icon={Globe} label="Country" value={city.countries.name} />
              )}
              {city.countries?.currency && (
                <FactRow icon={DollarSign} label="Currency" value={city.countries.currency} />
              )}
              {city.local_language && (
                <FactRow icon={Globe} label="Language" value={city.local_language} />
              )}
              {city.timezone && <FactRow icon={Clock} label="Timezone" value={city.timezone} />}
              {city.best_time_to_visit && (
                <FactRow
                  icon={Calendar}
                  label="Best Time"
                  value={city.best_time_to_visit}
                  valueSize="0.875rem"
                />
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollReveal>

      <LocationInfo name={city.name} type="city" />

      {city.latitude && city.longitude && (
        <WeatherForecast
          latitude={city.latitude}
          longitude={city.longitude}
          cityName={city.name}
        />
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm">
            <ChevronDown style={{ height: 16, width: 16 }} />
            Show more details
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Info style={{ height: 20, width: 20 }} />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {city.population && (
                  <FactRow
                    icon={Users}
                    label="Population"
                    value={city.population.toLocaleString()}
                  />
                )}
                {city.founded_year && (
                  <FactRow icon={Calendar} label="Founded" value={String(city.founded_year)} />
                )}
                {city.area_km2 && (
                  <FactRow icon={Mountain} label="Area" value={`${city.area_km2} km²`} />
                )}
                {city.elevation_m && (
                  <FactRow icon={Mountain} label="Elevation" value={`${city.elevation_m} m`} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Thermometer style={{ height: 20, width: 20 }} />
                  Climate & Geography
                </CardTitle>
              </CardHeader>
              <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {city.climate_type && (
                  <div className="p-3 rounded-lg bg-muted">
                    <div className="flex items-center gap-2 mb-1">
                      <Thermometer style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                      <span className="text-sm font-medium">Climate</span>
                    </div>
                    <span className="font-bold">{city.climate_type}</span>
                  </div>
                )}
                {city.latitude && city.longitude && (
                  <div className="p-3 rounded-lg bg-muted">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                      <span className="text-sm font-medium">Coordinates</span>
                    </div>
                    <span className="font-mono text-sm">
                      {city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Phone style={{ height: 20, width: 20 }} />
                  Contact & Codes
                </CardTitle>
              </CardHeader>
              <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {city.postal_codes && city.postal_codes.length > 0 && (
                  <div>
                    <span className="text-sm font-medium mb-2 block">Postal Codes</span>
                    <div className="flex flex-wrap gap-1">
                      {city.postal_codes.slice(0, 3).map((code: string, index: number) => (
                        <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                          {code}
                        </Badge>
                      ))}
                      {city.postal_codes.length > 3 && (
                        <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                          +{city.postal_codes.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                {city.area_codes && city.area_codes.length > 0 && (
                  <div>
                    <span className="text-sm font-medium mb-2 block">Area Codes</span>
                    <div className="flex flex-wrap gap-1">
                      {city.area_codes.map((code: string, index: number) => (
                        <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                          <Phone style={{ height: 12, width: 12, marginRight: 4 }} />
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {effectiveIata && (
                  <div className="p-3 rounded-lg bg-muted">
                    <div className="flex items-center gap-2 mb-1">
                      <Plane style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                      <span className="text-sm font-medium">
                        {hasAirport ? 'Major Airport' : 'Nearest Airport'}
                      </span>
                    </div>
                    <Badge variant="outline">{effectiveIata}</Badge>
                    {!hasAirport && nearestAirport && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {nearestAirport.city_name} — {nearestAirport.distanceKm} km
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {city.demographics && Object.keys(city.demographics).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users style={{ height: 20, width: 20 }} />
                    Demographics & Population
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(city.demographics).map(([key, value]) => (
                      <div key={key} className="p-3 rounded-lg bg-muted">
                        <span className="text-sm font-medium capitalize block mb-1">
                          {key.replace(/_/g, ' ')}
                        </span>
                        <span className="font-bold">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {city.economy_sectors && city.economy_sectors.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <DollarSign style={{ height: 20, width: 20 }} />
                      Economy Sectors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {city.economy_sectors.map((sector: string, index: number) => (
                        <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                          {sector}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {city.cost_of_living && Object.keys(city.cost_of_living).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <DollarSign style={{ height: 20, width: 20 }} />
                      Cost of Living
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-3">
                      {Object.entries(city.cost_of_living).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted"
                        >
                          <span className="text-sm font-medium capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="font-bold">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {city.universities && city.universities.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GraduationCap style={{ height: 20, width: 20 }} />
                    Universities & Education
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {city.universities.map((university: string, index: number) => (
                      <div key={index} className="p-3 rounded-lg bg-muted">
                        <div className="flex items-center gap-2">
                          <GraduationCap style={{ height: 16, width: 16 }} />
                          <span className="font-medium text-sm">{university}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {city.notable_landmarks && city.notable_landmarks.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Landmark style={{ height: 20, width: 20 }} />
                      Notable Landmarks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {city.notable_landmarks.map((landmark: string, index: number) => (
                        <div key={index} className="p-3 rounded-lg bg-muted">
                          <div className="flex items-center gap-2">
                            <Landmark style={{ height: 16, width: 16 }} />
                            <span className="font-medium">{landmark}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {city.sister_cities && city.sister_cities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Globe style={{ height: 20, width: 20 }} />
                      Sister Cities
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {city.sister_cities.map((sisterCity: string, index: number) => (
                        <div key={index} className="p-3 rounded-lg bg-muted">
                          <div className="flex items-center gap-2">
                            <Globe style={{ height: 16, width: 16 }} />
                            <span className="font-medium">{sisterCity}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </StaggerGrid>

          {city.local_customs && (
            <Card>
              <CardHeader>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Info style={{ height: 20, width: 20 }} />
                  Local Customs & Culture
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground" style={{ lineHeight: 1.7 }}>
                  {city.local_customs}
                </p>
              </CardContent>
            </Card>
          )}
        </CollapsibleContent>
      </Collapsible>

      {!villagesLoading && villages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Home style={{ height: 20, width: 20 }} />
              LGBTQ+ Neighborhoods
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {villages.map((village: VillageRelation) => (
                <VillageCard key={village.id} village={village} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
