import {
  MapPin,
  Globe,
  Users,
  Building2,
  Calendar,
  Star,
  TrendingUp,
  MapIcon,
  Newspaper,
  Cloud,
  Sun,
  CloudRain,
  Plane,
  Activity,
  Shield,
  Info,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { WeatherForecast } from '@/components/weather/WeatherForecast';
import { LocationInfo } from '@/components/location/LocationInfo';
import { VenueCard } from '@/components/venues/VenueCard';
import { EventCard } from '@/components/events/EventCard';
import { DirectoryCard } from '@/components/directory/DirectoryCard';
import CountryHeroImages from '@/components/country/CountryHeroImages';
import LGBTJurisdictionInfo from '@/components/country/LGBTJurisdictionInfo';
import { WorldBankDataPanel } from '@/components/country/WorldBankDataPanel';
import { SDGDataPanel } from '@/components/country/SDGDataPanel';
import { TravelDealsSection } from '@/components/travel/TravelDealsSection';
import { ActivitiesWidget } from '@/components/activities/ActivitiesWidget';
import { NewsCard } from '@/components/news/NewsCard';
import { supabase } from '@/integrations/supabase/client';

// CountryDetail accesses joined fields (continents, regions) on a row that doesn't
// declare them in the generated types. Mirror the page's existing loose typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CountryRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CityRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VenueRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArticleRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WeatherDataType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorldBankDataType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SDGDataType = any;

export async function fetchCountryWeather(country: CountryRelation): Promise<WeatherDataType> {
  if (!country?.latitude || !country?.longitude) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const { data, error } = await supabase.functions.invoke('get-weather-forecast', {
      body: {
        latitude: country.latitude,
        longitude: country.longitude,
        cityName: country.capital || country.name,
      },
    });
    if (data && !error) return data;
  } catch (error) {
    console.warn('Failed to fetch weather data:', error);
  } finally {
    clearTimeout(timeoutId);
  }
  return null;
}

export function getWeatherIcon(condition: string) {
  if (condition?.includes('rain') || condition?.includes('drizzle')) return CloudRain;
  if (condition?.includes('cloud')) return Cloud;
  return Sun;
}

export function SectionLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading {label}...</p>
    </div>
  );
}

export interface CountryHeroProps {
  country: CountryRelation;
  cities: CityRelation[];
  weatherData: WeatherDataType;
}

export function CountryHero({ country, cities, weatherData }: CountryHeroProps) {
  const continentName = (country as unknown as Record<string, { name?: string }>).continents?.name;
  const regionName = (country as unknown as Record<string, { name?: string }>).regions?.name;
  const subtitle = [continentName, regionName].filter(Boolean).join(', ');

  return (
    <div>
      <div className="relative mb-6">
        <CountryHeroImages country={country} />
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4 mb-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-4">
            <h3 className="text-3xl lg:text-5xl font-bold text-foreground">
              {country.flag_emoji} {country.name}
            </h3>
          </div>
          {subtitle && (
            <p className="text-lg text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {weatherData?.current && (
          <div className="flex items-center gap-2 bg-muted rounded-full px-4 py-2">
            {(() => {
              const WeatherIcon = getWeatherIcon(weatherData.current.condition);
              return <WeatherIcon style={{ height: 20, width: 20 }} />;
            })()}
            <span className="text-lg font-semibold">
              {Math.round(weatherData.current.temperature)}°C
            </span>
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {country.capital || country.name}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap mb-2 items-center">
        <ReportButton contentType="countries" contentId={country.id} contentName={country.name} />
        <AdminEditButton
          contentType="countries"
          contentId={country.id}
          contentName={country.name}
          currentData={country as Record<string, unknown>}
          onSaved={() => window.location.reload()}
        />
        {country.capital && (
          <Badge variant="outline" className="gap-1">
            <Star style={{ height: 14, width: 14 }} />
            Capital: {country.capital}
          </Badge>
        )}
        {country.population && (
          <Badge variant="outline" className="gap-1">
            <Users style={{ height: 14, width: 14 }} />
            {(country.population / 1e6).toFixed(1)}M people
          </Badge>
        )}
        {country.area_km2 && (
          <Badge variant="outline" className="gap-1">
            <MapIcon style={{ height: 14, width: 14 }} />
            {country.area_km2.toLocaleString()} km²
          </Badge>
        )}
        {cities.length > 0 && (
          <Badge variant="outline" className="gap-1">
            <Building2 style={{ height: 14, width: 14 }} />
            {cities.length} cities
          </Badge>
        )}
      </div>
    </div>
  );
}

export interface CountryOverviewTabProps {
  country: CountryRelation;
  worldBankData: WorldBankDataType;
  sdgData: SDGDataType;
}

export function CountryOverviewTab({
  country,
  worldBankData,
  sdgData,
}: CountryOverviewTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <ScrollReveal direction="up">
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <Globe style={{ height: 20, width: 20 }} />
                About {country.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground" style={{ lineHeight: 1.7 }}>
                {country.description ||
                  `Discover everything about ${country.name} – from major cities and cultural landmarks to local venues and upcoming events.`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <Star style={{ height: 20, width: 20 }} />
                Quick Facts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {country.capital && (
                <FactRow icon={Star} label="Capital" value={country.capital} />
              )}
              {country.currency && (
                <FactRow icon={TrendingUp} label="Currency" value={country.currency} />
              )}
              {country.languages && (
                <FactRow
                  icon={Globe}
                  label="Languages"
                  value={
                    <>
                      {Array.isArray(country.languages)
                        ? country.languages.slice(0, 3).join(', ')
                        : country.languages}
                      {Array.isArray(country.languages) && country.languages.length > 3
                        ? ` +${country.languages.length - 3}`
                        : ''}
                    </>
                  }
                  alignRight
                />
              )}
              {country.timezone && (
                <FactRow icon={Calendar} label="Timezone" value={country.timezone} />
              )}
              {country.calling_code && (
                <FactRow icon={MapPin} label="Calling Code" value={country.calling_code} />
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollReveal>

      <LocationInfo
        name={country.name}
        type="country"
        style={{ border: 0, backgroundColor: '#ffffff' }}
      />

      {country.latitude && country.longitude && (
        <Card>
          <CardContent>
            <WeatherForecast
              latitude={country.latitude}
              longitude={country.longitude}
              cityName={country.capital || country.name}
              style={{ height: '100%', border: 0, backgroundColor: '#ffffff' }}
            />
          </CardContent>
        </Card>
      )}

      <WorldBankDataPanel data={worldBankData} countryName={country.name} />
      <SDGDataPanel data={sdgData} countryName={country.name} />
    </div>
  );
}

interface FactRowProps {
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  label: string;
  value: React.ReactNode;
  alignRight?: boolean;
}

function FactRow({ icon: Icon, label, value, alignRight }: FactRowProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
      <div className="flex items-center gap-2">
        <Icon style={{ height: 14, width: 14, color: 'hsl(var(--muted-foreground))' }} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span
        className="font-bold"
        style={alignRight ? { textAlign: 'right', maxWidth: '60%' } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export interface CountryRightsTabProps {
  country: CountryRelation;
}

export function CountryRightsTab({ country }: CountryRightsTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">LGBTI Rights</h2>
          <p className="text-muted-foreground mt-1">
            Legal protections and rights status in {country.name}
          </p>
        </div>
      </div>

      <LGBTJurisdictionInfo
        country={country}
        style={{ boxShadow: 'none', borderColor: 'inherit' }}
      />
    </div>
  );
}

export interface CountryCitiesTabProps {
  country: CountryRelation;
  cities: CityRelation[];
  citiesLoading: boolean;
}

export function CountryCitiesTab({ country, cities, citiesLoading }: CountryCitiesTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Major Cities</h2>
          <p className="text-muted-foreground mt-1">
            Explore the most important cities in {country.name}
          </p>
        </div>
        <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
          {cities.length} cities
        </Badge>
      </div>

      {citiesLoading ? (
        <SectionLoader label="cities" />
      ) : cities.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {cities.map((city: CityRelation) => (
            <div
              key={city.id}
              className="cursor-pointer transition-transform duration-200 hover:scale-[1.03]"
            >
              <DirectoryCard
                type="city"
                name={city.name}
                data={city}
                onClick={() => (window.location.href = `/city/${city.slug || city.id}`)}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyCard
          icon={Building2}
          title="No cities found"
          description="No cities are currently listed for this country."
        />
      )}
    </div>
  );
}

export interface CountryVenuesTabProps {
  country: CountryRelation;
  venues: VenueRelation[];
  loading: boolean;
}

export function CountryVenuesTab({ country, venues, loading }: CountryVenuesTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Local Venues</h2>
          <p className="text-muted-foreground mt-1">
            Discover amazing places to visit in {country.name}
          </p>
        </div>
        <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
          {venues.length} venues
        </Badge>
      </div>

      {loading ? (
        <SectionLoader label="venues" />
      ) : venues.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {venues.map((venue: VenueRelation) => (
            <div
              key={venue.id}
              className="transition-transform duration-200 hover:scale-[1.03]"
            >
              <VenueCard venue={venue} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyCard
          icon={MapPin}
          title="No venues found yet"
          description={`Be the first to add venues from ${country.name}!`}
        />
      )}
    </div>
  );
}

export interface CountryEventsTabProps {
  country: CountryRelation;
  events: EventRelation[];
  eventsLoading: boolean;
}

export function CountryEventsTab({ country, events, eventsLoading }: CountryEventsTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Upcoming Events</h2>
          <p className="text-muted-foreground mt-1">
            Don't miss out on exciting events happening in {country.name}
          </p>
        </div>
        <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
          {events.length} events
        </Badge>
      </div>

      {eventsLoading ? (
        <SectionLoader label="events" />
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event: EventRelation) => (
            <div
              key={event.id}
              className="transition-transform duration-200 hover:scale-[1.03]"
            >
              <EventCard event={event} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyCard
          icon={Calendar}
          title="No upcoming events"
          description="No events are currently scheduled for this country."
        />
      )}
    </div>
  );
}

export interface CountryTravelTabProps {
  country: CountryRelation;
}

export function CountryTravelTab({ country }: CountryTravelTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Travel & Tours</h2>
        <p className="text-muted-foreground mt-1">
          Find flights and experiences in {country.name}
        </p>
      </div>

      <TravelDealsSection
        destinationCity={country.capital || country.name}
        destinationCountryCode={country.code}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            <Activity style={{ height: 20, width: 20 }} />
            Activities & Tours
          </CardTitle>
          <CardDescription>Discover amazing experiences in {country.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivitiesWidget
            destination={country.capital || country.name}
            countryCode={country.code}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export interface CountryNewsTabProps {
  country: CountryRelation;
  articles: ArticleRelation[];
  newsLoading: boolean;
  onViewArticle?: (id: string) => void;
}

export function CountryNewsTab({
  country,
  articles,
  newsLoading,
  onViewArticle,
}: CountryNewsTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Local News</h2>
          <p className="text-muted-foreground mt-1">
            Stay updated with the latest news from {country.name}
          </p>
        </div>
        <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
          {articles.length} articles
        </Badge>
      </div>

      {newsLoading ? (
        <SectionLoader label="news" />
      ) : articles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article: ArticleRelation) => (
            <div
              key={article.id}
              className="transition-transform duration-200 hover:scale-[1.03]"
            >
              <NewsCard article={article} onViewArticle={onViewArticle} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyCard
          icon={Newspaper}
          title="No local news found"
          description={`No news articles are currently available for ${country.name}.`}
        />
      )}
    </div>
  );
}

export interface CountryMapTabProps {
  country: CountryRelation;
  ExploreMap: React.ComponentType<Record<string, unknown>>;
  Suspense: typeof import('react').Suspense;
}

export function CountryMapTab({ country, ExploreMap, Suspense }: CountryMapTabProps) {
  if (typeof country.latitude !== 'number' || typeof country.longitude !== 'number') return null;
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
        initialCenter={[Number(country.longitude), Number(country.latitude)]}
        initialZoom={5}
        defaultLayers={['venues', 'events', 'cities']}
        showLayerToggles
        showFilters={false}
        skipAutoFly
      />
    </Suspense>
  );
}

interface EmptyCardProps {
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  title: string;
  description: string;
}

function EmptyCard({ icon: Icon, title, description }: EmptyCardProps) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-muted rounded-full w-20 h-20 mx-auto flex items-center justify-center">
            <Icon style={{ height: 40, width: 40, color: 'hsl(var(--muted-foreground))' }} />
          </div>
          <div>
            <p className="text-lg font-semibold">{title}</p>
            <p className="text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const COUNTRY_TAB_DEFS = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'rights', label: 'Rights', icon: Shield },
  { id: 'cities', label: 'Cities', icon: Building2 },
  { id: 'venues', label: 'Venues', icon: MapPin },
  { id: 'events', label: 'Events', icon: Calendar },
  { id: 'travel', label: 'Travel', icon: Plane },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'map', label: 'Map', icon: MapIcon },
];
