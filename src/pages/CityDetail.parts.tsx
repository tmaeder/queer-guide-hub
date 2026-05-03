import type { ReactNode } from 'react';
import {
  MapPin,
  Globe,
  Users,
  Calendar,
  Building,
  Star,
  Heart,
  Clock,
  Thermometer,
  Mountain,
  Phone,
  Plane,
  Bus,
  DollarSign,
  GraduationCap,
  Landmark,
  Info,
  FileText,
  Shield,
  Home,
  Map as MapIcon,
  ChevronDown,
  Luggage,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { DetailHero } from '@/components/layout/DetailHero';
import { NewsCard } from '@/components/news/NewsCard';
import { VenueCard } from '@/components/venues/VenueCard';
import { EventCard } from '@/components/events/EventCard';
import { VillageCard } from '@/components/villages/VillageCard';
import { WeatherForecast } from '@/components/weather/WeatherForecast';
import { InlineLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/EmptyState';
import { CityTravelHub } from '@/components/travel/CityTravelHub';
import { SimilarCities } from '@/components/personalization/SimilarCities';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { LocationInfo } from '@/components/location/LocationInfo';
import LGBTJurisdictionInfo from '@/components/country/LGBTJurisdictionInfo';

// CityDetail accesses city.countries (a runtime join not present on Tables<'cities'>).
// Mirror the page's existing loose typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CityRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CountryRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VenueRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VillageRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArticleRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NearestAirportType = any;

export function formatPopulation(pop: number) {
  if (pop >= 1e6) return `${(pop / 1e6).toFixed(1)}M people`;
  if (pop >= 1e3) return `${(pop / 1e3).toFixed(0)}K people`;
  return `${pop} people`;
}

export interface CityHeroProps {
  city: CityRelation;
  imageUrl: string;
  isFavorited: boolean;
  hasAirport: boolean;
  effectiveIata: string | null;
  onFavoriteToggle: () => void;
  refetchCity: () => void;
}

export function CityHero({
  city,
  imageUrl,
  isFavorited,
  hasAirport,
  effectiveIata,
  onFavoriteToggle,
  refetchCity,
}: CityHeroProps) {
  return (
    <>
      <DetailHero imageUrl={imageUrl} alt={city.name} heightClassName="h-48 md:h-60" />

      <SafetyAlertBanner
        criminalization={
          city.countries?.lgbti_criminalization as Record<string, unknown> | null | undefined
        }
        countryName={city.countries?.name || ''}
      />

      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-4 mb-1">
            <h3 className="text-3xl lg:text-5xl font-bold text-foreground">
              {city.countries?.flag_emoji && <>{city.countries.flag_emoji} </>}
              {city.name}
            </h3>
            {city.countries?.equality_score != null && (
              <EqualityScoreBadge score={city.countries.equality_score} size="md" />
            )}
          </div>
          <p className="text-lg text-muted-foreground mb-2">
            {city.region_name && `${city.region_name}, `}
            {city.countries ? (
              <LocalizedLink
                to={`/country/${city.countries.slug || city.countries.id}`}
                style={{
                  color: 'inherit',
                  textDecoration: 'underline',
                  textDecorationColor: 'currentColor',
                  textUnderlineOffset: '2px',
                }}
              >
                {city.countries.name}
              </LocalizedLink>
            ) : null}
          </p>
        </div>

        <div className="flex gap-2 flex-shrink-0 mt-2 flex-wrap">
          <ReportButton contentType="cities" contentId={city.id} contentName={city.name} />
          <AdminEditButton
            contentType="cities"
            contentId={city.id}
            contentName={city.name}
            currentData={city as Record<string, unknown>}
            onSaved={() => refetchCity()}
          />
          <Button variant="outline" size="sm" onClick={onFavoriteToggle}>
            <Heart
              style={{
                height: 16,
                width: 16,
                marginRight: 6,
                ...(isFavorited ? { fill: 'currentColor', color: 'inherit' } : {}),
              }}
            />
            {isFavorited ? 'Favorited' : 'Favorite'}
          </Button>
          {city.official_website && (
            <Button variant="outline" size="sm" asChild>
              <a href={city.official_website} target="_blank" rel="noopener noreferrer">
                <Globe style={{ height: 16, width: 16, marginRight: 6 }} />
                Website
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {city.is_capital && (
          <Badge variant="outline" className="gap-1">
            <Building style={{ height: 14, width: 14 }} />
            Capital City
          </Badge>
        )}
        {city.is_major_city && (
          <Badge variant="outline" className="gap-1">
            <MapPin style={{ height: 14, width: 14 }} />
            Major City
          </Badge>
        )}
        {city.population && (
          <Badge variant="outline" className="gap-1">
            <Users style={{ height: 14, width: 14 }} />
            {formatPopulation(city.population)}
          </Badge>
        )}
        {city.timezone && (
          <Badge variant="outline" className="gap-1">
            <Clock style={{ height: 14, width: 14 }} />
            {city.timezone}
          </Badge>
        )}
        {effectiveIata && (
          <Badge variant="outline" className="gap-1">
            <Plane style={{ height: 14, width: 14 }} />
            {hasAirport ? effectiveIata : `~${effectiveIata} (nearest)`}
          </Badge>
        )}
        {city.climate_type && (
          <Badge variant="outline" className="gap-1">
            <Thermometer style={{ height: 14, width: 14 }} />
            {city.climate_type}
          </Badge>
        )}
        {city.lgbt_friendly_rating && (
          <Badge variant="outline" className="gap-1">
            <Star style={{ height: 14, width: 14, fill: 'currentColor', color: 'inherit' }} />
            {city.lgbt_friendly_rating}/5 LGBTQ+ Friendly
          </Badge>
        )}
      </div>
    </>
  );
}

export interface CityOverviewTabProps {
  city: CityRelation;
  villages: VillageRelation[];
  villagesLoading: boolean;
  hasAirport: boolean;
  effectiveIata: string | null;
  nearestAirport: NearestAirportType;
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

export interface CityRightsTabProps {
  city: CityRelation;
  fullCountry: CountryRelation | null | undefined;
  countryLoading: boolean;
}

export function CityRightsTab({ city, fullCountry, countryLoading }: CityRightsTabProps) {
  return (
    <div className="flex flex-col gap-6 mt-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">LGBTI Rights</h2>
          <p className="text-muted-foreground mt-1">
            Legal protections and rights status in{' '}
            {city.countries ? (
              <LocalizedLink
                to={`/country/${city.countries.slug || city.countries.id}`}
                style={{ color: 'inherit', textDecoration: 'underline' }}
              >
                {city.countries.name}
              </LocalizedLink>
            ) : (
              'this country'
            )}
          </p>
        </div>
        {city.countries?.equality_score != null && (
          <EqualityScoreBadge score={city.countries.equality_score} size="lg" />
        )}
      </div>

      <div className="p-4 rounded-lg bg-muted">
        <p className="text-sm text-muted-foreground" style={{ fontSize: '0.8125rem' }}>
          The rights information below applies to {city.countries?.name || 'this country'} at the
          national level. Local laws and enforcement in {city.name} may vary.
        </p>
      </div>

      {countryLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <InlineLoading text="Loading rights data..." size="md" />
        </div>
      ) : fullCountry ? (
        <LGBTJurisdictionInfo country={fullCountry} />
      ) : (
        <p className="text-muted-foreground text-center py-8">
          Rights data is not available for this location.
        </p>
      )}
    </div>
  );
}

export interface CityVenuesTabProps {
  city: CityRelation;
  venues: VenueRelation[];
  venuesLoading: boolean;
  showCreateTrip: boolean;
  onCreateTrip: () => void;
}

export function CityVenuesTab({
  city,
  venues,
  venuesLoading,
  showCreateTrip,
  onCreateTrip,
}: CityVenuesTabProps) {
  return (
    <div className="mt-6">
      {showCreateTrip && (
        <Card style={{ marginBottom: 16 }}>
          <CardContent style={{ paddingTop: 20 }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Luggage style={{ width: 20, height: 20, opacity: 0.6 }} />
                <p className="font-medium">Planning a trip to {city.name}?</p>
              </div>
              <Button variant="outline" size="sm" onClick={onCreateTrip}>
                Create Trip
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {venuesLoading ? (
        <InlineLoading text="Loading venues..." size="md" />
      ) : venues.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {venues.map((venue: VenueRelation) => (
            <VenueCard key={venue.id} venue={venue} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Building}
          title="No venues found yet"
          description={`Be the first to add venues in ${city.name}!`}
          mood="encouraging"
        />
      )}
    </div>
  );
}

export interface CityEventsTabProps {
  city: CityRelation;
  events: EventRelation[];
  eventsLoading: boolean;
}

export function CityEventsTab({ city, events, eventsLoading }: CityEventsTabProps) {
  return (
    <div className="mt-6">
      {eventsLoading ? (
        <InlineLoading text="Loading events..." size="md" />
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map((event: EventRelation) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Calendar}
          title="No upcoming events"
          description={`Check back later for events in ${city.name}!`}
          mood="encouraging"
        />
      )}
    </div>
  );
}

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
              <div className="p-3 rounded-lg bg-muted mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Plane style={{ height: 16, width: 16 }} />
                  <span className="text-sm font-medium">Major Airport</span>
                </div>
                <span className="font-bold">{city.major_airport_code}</span>
              </div>
            )}
            {!hasAirport && nearestAirport && (
              <div className="p-3 rounded-lg bg-muted mb-4">
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
                  <div key={key} className="p-3 rounded-lg bg-muted">
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
  );
}

export interface CityNewsTabProps {
  city: CityRelation;
  articles: ArticleRelation[];
  newsLoading: boolean;
}

export function CityNewsTab({ city, articles, newsLoading }: CityNewsTabProps) {
  return (
    <div className="mt-6">
      {newsLoading ? (
        <InlineLoading text="Loading news..." size="md" />
      ) : articles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.slice(0, 6).map((article: ArticleRelation) => (
            <NewsCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No news available"
          description={`Check back later for news about ${city.name}!`}
          mood="neutral"
        />
      )}
    </div>
  );
}

export interface CityMapTabProps {
  city: CityRelation;
  ExploreMap: React.ComponentType<Record<string, unknown>>;
  Suspense: typeof import('react').Suspense;
}

export function CityMapTab({ city, ExploreMap, Suspense }: CityMapTabProps) {
  if (typeof city.latitude !== 'number' || typeof city.longitude !== 'number') return null;
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
        </div>
      }
    >
      <ExploreMap
        height={500}
        initialCenter={[Number(city.longitude), Number(city.latitude)]}
        initialZoom={12}
        defaultLayers={['venues', 'events', 'neighbourhoods']}
        showLayerToggles
        showFilters={false}
        skipAutoFly
      />
    </Suspense>
  );
}

export const CITY_TAB_DEFS = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'rights', label: 'Rights', icon: Shield },
  { id: 'venues', label: 'Venues', icon: Building },
  { id: 'events', label: 'Events', icon: Calendar },
  { id: 'travel', label: 'Travel', icon: Plane },
  { id: 'news', label: 'News', icon: FileText },
  { id: 'map', label: 'Map', icon: MapIcon },
];
