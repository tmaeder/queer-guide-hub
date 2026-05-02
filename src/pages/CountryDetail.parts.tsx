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
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
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
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        gap: 1.5,
      }}
    >
      <Box
        sx={{
          animation: 'spin 1s linear infinite',
          height: 24,
          width: 24,
          border: '2px solid',
          borderColor: 'primary.main',
          borderTopColor: 'transparent',
          borderRadius: '50%',
        }}
      />
      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
        Loading {label}...
      </Typography>
    </Box>
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
    <Box>
      <Box sx={{ position: 'relative', mb: 3 }}>
        <CountryHeroImages country={country} />
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          mb: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography
              variant="h3"
              sx={{
                fontSize: { xs: '2rem', lg: '2.75rem' },
                fontWeight: 700,
                color: 'text.primary',
              }}
            >
              {country.flag_emoji} {country.name}
            </Typography>
          </Box>
          {subtitle && (
            <Typography sx={{ fontSize: '1.125rem', color: 'text.secondary' }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        {weatherData?.current && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'action.hover',
              borderRadius: '9999px',
              px: 2,
              py: 1,
            }}
          >
            {(() => {
              const WeatherIcon = getWeatherIcon(weatherData.current.condition);
              return <WeatherIcon style={{ height: 20, width: 20 }} />;
            })()}
            <Box component="span" sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
              {Math.round(weatherData.current.temperature)}°C
            </Box>
            <Box
              component="span"
              sx={{
                fontSize: '0.875rem',
                color: 'text.secondary',
                display: { xs: 'none', sm: 'inline' },
              }}
            >
              {country.capital || country.name}
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1, alignItems: 'center' }}>
        <ReportButton contentType="countries" contentId={country.id} contentName={country.name} />
        <AdminEditButton
          contentType="countries"
          contentId={country.id}
          contentName={country.name}
          currentData={country as Record<string, unknown>}
          onSaved={() => window.location.reload()}
        />
        {country.capital && (
          <Chip
            icon={<Star style={{ height: 14, width: 14 }} />}
            label={`Capital: ${country.capital}`}
            size="small"
            variant="outlined"
          />
        )}
        {country.population && (
          <Chip
            icon={<Users style={{ height: 14, width: 14 }} />}
            label={`${(country.population / 1e6).toFixed(1)}M people`}
            size="small"
            variant="outlined"
          />
        )}
        {country.area_km2 && (
          <Chip
            icon={<MapIcon style={{ height: 14, width: 14 }} />}
            label={`${country.area_km2.toLocaleString()} km²`}
            size="small"
            variant="outlined"
          />
        )}
        {cities.length > 0 && (
          <Chip
            icon={<Building2 style={{ height: 14, width: 14 }} />}
            label={`${cities.length} cities`}
            size="small"
            variant="outlined"
          />
        )}
      </Box>
    </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <ScrollReveal direction="up">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' },
            gap: 3,
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle>
                <Globe style={{ height: 20, width: 20 }} />
                About {country.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                {country.description ||
                  `Discover everything about ${country.name} – from major cities and cultural landmarks to local venues and upcoming events.`}
              </Typography>
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
        </Box>
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
    </Box>
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
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: 1.5,
        borderRadius: 2,
        bgcolor: 'action.hover',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon style={{ height: 14, width: 14, color: 'hsl(var(--muted-foreground))' }} />
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{label}</Typography>
      </Box>
      <Typography
        sx={{
          fontWeight: 700,
          ...(alignRight ? { textAlign: 'right', maxWidth: '60%' } : {}),
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export interface CountryRightsTabProps {
  country: CountryRelation;
}

export function CountryRightsTab({ country }: CountryRightsTabProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography
            variant="h2"
            sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
          >
            LGBTI Rights
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
            Legal protections and rights status in {country.name}
          </Typography>
        </Box>
      </Box>

      <LGBTJurisdictionInfo
        country={country}
        style={{ boxShadow: 'none', borderColor: 'inherit' }}
      />
    </Box>
  );
}

export interface CountryCitiesTabProps {
  country: CountryRelation;
  cities: CityRelation[];
  citiesLoading: boolean;
}

export function CountryCitiesTab({ country, cities, citiesLoading }: CountryCitiesTabProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography
            variant="h2"
            sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
          >
            Major Cities
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
            Explore the most important cities in {country.name}
          </Typography>
        </Box>
        <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
          {cities.length} cities
        </Badge>
      </Box>

      {citiesLoading ? (
        <SectionLoader label="cities" />
      ) : cities.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: '1fr 1fr',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            gap: 3,
          }}
        >
          {cities.map((city: CityRelation) => (
            <Box
              key={city.id}
              sx={{
                cursor: 'pointer',
                transition: 'transform 0.2s',
                '&:hover': { transform: 'scale(1.03)' },
              }}
            >
              <DirectoryCard
                type="city"
                name={city.name}
                data={city}
                onClick={() => (window.location.href = `/city/${city.slug || city.id}`)}
              />
            </Box>
          ))}
        </Box>
      ) : (
        <EmptyCard
          icon={Building2}
          title="No cities found"
          description="No cities are currently listed for this country."
        />
      )}
    </Box>
  );
}

export interface CountryVenuesTabProps {
  country: CountryRelation;
  venues: VenueRelation[];
  loading: boolean;
}

export function CountryVenuesTab({ country, venues, loading }: CountryVenuesTabProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography
            variant="h2"
            sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
          >
            Local Venues
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
            Discover amazing places to visit in {country.name}
          </Typography>
        </Box>
        <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
          {venues.length} venues
        </Badge>
      </Box>

      {loading ? (
        <SectionLoader label="venues" />
      ) : venues.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
            gap: 3,
          }}
        >
          {venues.map((venue: VenueRelation) => (
            <Box
              key={venue.id}
              sx={{
                transition: 'transform 0.2s',
                '&:hover': { transform: 'scale(1.03)' },
              }}
            >
              <VenueCard venue={venue} />
            </Box>
          ))}
        </Box>
      ) : (
        <EmptyCard
          icon={MapPin}
          title="No venues found yet"
          description={`Be the first to add venues from ${country.name}!`}
        />
      )}
    </Box>
  );
}

export interface CountryEventsTabProps {
  country: CountryRelation;
  events: EventRelation[];
  eventsLoading: boolean;
}

export function CountryEventsTab({ country, events, eventsLoading }: CountryEventsTabProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography
            variant="h2"
            sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
          >
            Upcoming Events
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
            Don't miss out on exciting events happening in {country.name}
          </Typography>
        </Box>
        <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
          {events.length} events
        </Badge>
      </Box>

      {eventsLoading ? (
        <SectionLoader label="events" />
      ) : events.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' },
            gap: 3,
          }}
        >
          {events.map((event: EventRelation) => (
            <Box
              key={event.id}
              sx={{
                transition: 'transform 0.2s',
                '&:hover': { transform: 'scale(1.03)' },
              }}
            >
              <EventCard event={event} />
            </Box>
          ))}
        </Box>
      ) : (
        <EmptyCard
          icon={Calendar}
          title="No upcoming events"
          description="No events are currently scheduled for this country."
        />
      )}
    </Box>
  );
}

export interface CountryTravelTabProps {
  country: CountryRelation;
}

export function CountryTravelTab({ country }: CountryTravelTabProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography
          variant="h2"
          sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
        >
          Travel & Tours
        </Typography>
        <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
          Find flights and experiences in {country.name}
        </Typography>
      </Box>

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
    </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography
            variant="h2"
            sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
          >
            Local News
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
            Stay updated with the latest news from {country.name}
          </Typography>
        </Box>
        <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
          {articles.length} articles
        </Badge>
      </Box>

      {newsLoading ? (
        <SectionLoader label="news" />
      ) : articles.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' },
            gap: 3,
          }}
        >
          {articles.map((article: ArticleRelation) => (
            <Box
              key={article.id}
              sx={{
                transition: 'transform 0.2s',
                '&:hover': { transform: 'scale(1.03)' },
              }}
            >
              <NewsCard article={article} onViewArticle={onViewArticle} />
            </Box>
          ))}
        </Box>
      ) : (
        <EmptyCard
          icon={Newspaper}
          title="No local news found"
          description={`No news articles are currently available for ${country.name}.`}
        />
      )}
    </Box>
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
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} aria-label="Loading" />
        </Box>
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box
            sx={{
              p: 2,
              bgcolor: 'action.hover',
              borderRadius: '50%',
              width: 80,
              height: 80,
              mx: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon style={{ height: 40, width: 40, color: 'hsl(var(--muted-foreground))' }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>{title}</Typography>
            <Typography sx={{ color: 'text.secondary' }}>{description}</Typography>
          </Box>
        </Box>
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
