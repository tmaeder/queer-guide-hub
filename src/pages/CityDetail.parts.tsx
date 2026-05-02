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
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
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
      <DetailHero imageUrl={imageUrl} alt={city.name} height={{ xs: 192, md: 240 }} />

      <SafetyAlertBanner
        criminalization={
          city.countries?.lgbti_criminalization as Record<string, unknown> | null | undefined
        }
        countryName={city.countries?.name || ''}
      />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0.5 }}>
            <Typography
              variant="h3"
              sx={{
                fontSize: { xs: '2rem', lg: '2.75rem' },
                fontWeight: 700,
                color: 'text.primary',
              }}
            >
              {city.countries?.flag_emoji && <>{city.countries.flag_emoji} </>}
              {city.name}
            </Typography>
            {city.countries?.equality_score != null && (
              <EqualityScoreBadge score={city.countries.equality_score} size="md" />
            )}
          </Box>
          <Typography sx={{ fontSize: '1.125rem', color: 'text.secondary', mb: 1 }}>
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
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, mt: 1, flexWrap: 'wrap' }}>
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
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {city.is_capital && (
          <Chip
            icon={<Building style={{ height: 14, width: 14 }} />}
            label="Capital City"
            size="small"
            variant="outlined"
          />
        )}
        {city.is_major_city && (
          <Chip
            icon={<MapPin style={{ height: 14, width: 14 }} />}
            label="Major City"
            size="small"
            variant="outlined"
          />
        )}
        {city.population && (
          <Chip
            icon={<Users style={{ height: 14, width: 14 }} />}
            label={formatPopulation(city.population)}
            size="small"
            variant="outlined"
          />
        )}
        {city.timezone && (
          <Chip
            icon={<Clock style={{ height: 14, width: 14 }} />}
            label={city.timezone}
            size="small"
            variant="outlined"
          />
        )}
        {effectiveIata && (
          <Chip
            icon={<Plane style={{ height: 14, width: 14 }} />}
            label={hasAirport ? effectiveIata : `~${effectiveIata} (nearest)`}
            size="small"
            variant="outlined"
          />
        )}
        {city.climate_type && (
          <Chip
            icon={<Thermometer style={{ height: 14, width: 14 }} />}
            label={city.climate_type}
            size="small"
            variant="outlined"
          />
        )}
        {city.lgbt_friendly_rating && (
          <Chip
            icon={
              <Star style={{ height: 14, width: 14, fill: 'currentColor', color: 'inherit' }} />
            }
            label={`${city.lgbt_friendly_rating}/5 LGBTQ+ Friendly`}
            size="small"
            variant="outlined"
          />
        )}
      </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 3 }}>
      <ScrollReveal direction="up">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, gap: 3 }}>
          <Card>
            <CardHeader>
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Globe style={{ height: 20, width: 20 }} />
                About {city.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                {city.description ||
                  `Discover ${city.name} – from local venues and cultural landmarks to upcoming events.`}
              </Typography>
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
        </Box>
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
          <StaggerGrid
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
              gap: 3,
            }}
          >
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
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Thermometer
                        style={{
                          height: 16,
                          width: 16,
                          color: 'hsl(var(--muted-foreground))',
                        }}
                      />
                      <Typography
                        component="span"
                        sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                      >
                        Climate
                      </Typography>
                    </Box>
                    <Typography component="span" sx={{ fontWeight: 700 }}>
                      {city.climate_type}
                    </Typography>
                  </Box>
                )}
                {city.latitude && city.longitude && (
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <MapPin
                        style={{
                          height: 16,
                          width: 16,
                          color: 'hsl(var(--muted-foreground))',
                        }}
                      />
                      <Typography
                        component="span"
                        sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                      >
                        Coordinates
                      </Typography>
                    </Box>
                    <Typography
                      component="span"
                      sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                    >
                      {city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}
                    </Typography>
                  </Box>
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
                  <Box>
                    <Typography
                      component="span"
                      sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1, display: 'block' }}
                    >
                      Postal Codes
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
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
                    </Box>
                  </Box>
                )}
                {city.area_codes && city.area_codes.length > 0 && (
                  <Box>
                    <Typography
                      component="span"
                      sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1, display: 'block' }}
                    >
                      Area Codes
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {city.area_codes.map((code: string, index: number) => (
                        <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                          <Phone style={{ height: 12, width: 12, marginRight: 4 }} />
                          {code}
                        </Badge>
                      ))}
                    </Box>
                  </Box>
                )}
                {effectiveIata && (
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Plane
                        style={{
                          height: 16,
                          width: 16,
                          color: 'hsl(var(--muted-foreground))',
                        }}
                      />
                      <Typography
                        component="span"
                        sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                      >
                        {hasAirport ? 'Major Airport' : 'Nearest Airport'}
                      </Typography>
                    </Box>
                    <Badge variant="outline">{effectiveIata}</Badge>
                    {!hasAirport && nearestAirport && (
                      <Typography
                        sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}
                      >
                        {nearestAirport.city_name} — {nearestAirport.distanceKm} km
                      </Typography>
                    )}
                  </Box>
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
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        md: 'repeat(2, 1fr)',
                        lg: 'repeat(3, 1fr)',
                      },
                      gap: 2,
                    }}
                  >
                    {Object.entries(city.demographics).map(([key, value]) => (
                      <Box key={key} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Typography
                          component="span"
                          sx={{
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            textTransform: 'capitalize',
                            display: 'block',
                            mb: 0.5,
                          }}
                        >
                          {key.replace(/_/g, ' ')}
                        </Typography>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {String(value)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                gap: 3,
              }}
            >
              {city.economy_sectors && city.economy_sectors.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <DollarSign style={{ height: 20, width: 20 }} />
                      Economy Sectors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {city.economy_sectors.map((sector: string, index: number) => (
                        <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                          {sector}
                        </Badge>
                      ))}
                    </Box>
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
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {Object.entries(city.cost_of_living).map(([key, value]) => (
                        <Box
                          key={key}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: 'action.hover',
                          }}
                        >
                          <Typography
                            component="span"
                            sx={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              textTransform: 'capitalize',
                            }}
                          >
                            {key.replace(/_/g, ' ')}
                          </Typography>
                          <Typography component="span" sx={{ fontWeight: 700 }}>
                            {String(value)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>

            {city.universities && city.universities.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GraduationCap style={{ height: 20, width: 20 }} />
                    Universities & Education
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        md: 'repeat(2, 1fr)',
                        lg: 'repeat(3, 1fr)',
                      },
                      gap: 1.5,
                    }}
                  >
                    {city.universities.map((university: string, index: number) => (
                      <Box key={index} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <GraduationCap style={{ height: 16, width: 16 }} />
                          <Typography
                            component="span"
                            sx={{ fontWeight: 500, fontSize: '0.875rem' }}
                          >
                            {university}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                gap: 3,
              }}
            >
              {city.notable_landmarks && city.notable_landmarks.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Landmark style={{ height: 20, width: 20 }} />
                      Notable Landmarks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'grid', gap: 1.5 }}>
                      {city.notable_landmarks.map((landmark: string, index: number) => (
                        <Box key={index} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Landmark style={{ height: 16, width: 16 }} />
                            <Typography component="span" sx={{ fontWeight: 500 }}>
                              {landmark}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
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
                    <Box sx={{ display: 'grid', gap: 1.5 }}>
                      {city.sister_cities.map((sisterCity: string, index: number) => (
                        <Box key={index} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Globe style={{ height: 16, width: 16 }} />
                            <Typography component="span" sx={{ fontWeight: 500 }}>
                              {sisterCity}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>
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
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                  {city.local_customs}
                </Typography>
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
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)',
                },
                gap: 2,
              }}
            >
              {villages.map((village: VillageRelation) => (
                <VillageCard key={village.id} village={village} />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
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
        <Icon style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
          {label}
        </Typography>
      </Box>
      <Typography
        component="span"
        sx={{ fontWeight: 700, ...(valueSize ? { fontSize: valueSize } : {}) }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export interface CityRightsTabProps {
  city: CityRelation;
  fullCountry: CountryRelation | null | undefined;
  countryLoading: boolean;
}

export function CityRightsTab({ city, fullCountry, countryLoading }: CityRightsTabProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography
            variant="h2"
            sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
          >
            LGBTI Rights
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
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
          </Typography>
        </Box>
        {city.countries?.equality_score != null && (
          <EqualityScoreBadge score={city.countries.equality_score} size="lg" />
        )}
      </Box>

      <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
          The rights information below applies to {city.countries?.name || 'this country'} at the
          national level. Local laws and enforcement in {city.name} may vary.
        </Typography>
      </Box>

      {countryLoading ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 8,
            gap: 2,
          }}
        >
          <InlineLoading text="Loading rights data..." size="md" />
        </Box>
      ) : fullCountry ? (
        <LGBTJurisdictionInfo country={fullCountry} />
      ) : (
        <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
          Rights data is not available for this location.
        </Typography>
      )}
    </Box>
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
    <Box sx={{ mt: 3 }}>
      {showCreateTrip && (
        <Card style={{ marginBottom: 16 }}>
          <CardContent style={{ paddingTop: 20 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Luggage style={{ width: 20, height: 20, opacity: 0.6 }} />
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Planning a trip to {city.name}?
                </Typography>
              </Box>
              <Button variant="outline" size="sm" onClick={onCreateTrip}>
                Create Trip
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
      {venuesLoading ? (
        <InlineLoading text="Loading venues..." size="md" />
      ) : venues.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          {venues.map((venue: VenueRelation) => (
            <VenueCard key={venue.id} venue={venue} />
          ))}
        </Box>
      ) : (
        <EmptyState
          icon={Building}
          title="No venues found yet"
          description={`Be the first to add venues in ${city.name}!`}
          mood="encouraging"
        />
      )}
    </Box>
  );
}

export interface CityEventsTabProps {
  city: CityRelation;
  events: EventRelation[];
  eventsLoading: boolean;
}

export function CityEventsTab({ city, events, eventsLoading }: CityEventsTabProps) {
  return (
    <Box sx={{ mt: 3 }}>
      {eventsLoading ? (
        <InlineLoading text="Loading events..." size="md" />
      ) : events.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          {events.map((event: EventRelation) => (
            <EventCard key={event.id} event={event} />
          ))}
        </Box>
      ) : (
        <EmptyState
          icon={Calendar}
          title="No upcoming events"
          description={`Check back later for events in ${city.name}!`}
          mood="encouraging"
        />
      )}
    </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 3 }}>
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

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          gap: 3,
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plane style={{ height: 20, width: 20 }} />
              Airports
            </CardTitle>
          </CardHeader>
          <CardContent>
            {city.major_airport_code && (
              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Plane style={{ height: 16, width: 16 }} />
                  <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    Major Airport
                  </Typography>
                </Box>
                <Typography component="span" sx={{ fontWeight: 700 }}>
                  {city.major_airport_code}
                </Typography>
              </Box>
            )}
            {!hasAirport && nearestAirport && (
              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Plane style={{ height: 16, width: 16 }} />
                  <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    Nearest Airport
                  </Typography>
                </Box>
                <Typography component="span" sx={{ fontWeight: 700 }}>
                  {nearestAirport.iata_code}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
                  {nearestAirport.city_name} — {nearestAirport.distanceKm} km away
                </Typography>
              </Box>
            )}
            {city.airport_codes && city.airport_codes.length > 0 && (
              <Box>
                <Typography
                  component="span"
                  sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1.5, display: 'block' }}
                >
                  All Airport Codes
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {city.airport_codes.map((code: string, index: number) => (
                    <Badge key={index} variant="outline">
                      <Plane style={{ height: 12, width: 12, marginRight: 4 }} />
                      {code}
                    </Badge>
                  ))}
                </Box>
              </Box>
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
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {Object.entries(city.transportation_info).map(([key, value]) => (
                  <Box key={key} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Bus
                        style={{
                          height: 16,
                          width: 16,
                          color: 'hsl(var(--muted-foreground))',
                        }}
                      />
                      <Typography
                        component="span"
                        sx={{
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          textTransform: 'capitalize',
                        }}
                      >
                        {key.replace(/_/g, ' ')}
                      </Typography>
                    </Box>
                    <Typography component="span" sx={{ fontSize: '0.875rem' }}>
                      {String(value)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                No transportation information available.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export interface CityNewsTabProps {
  city: CityRelation;
  articles: ArticleRelation[];
  newsLoading: boolean;
}

export function CityNewsTab({ city, articles, newsLoading }: CityNewsTabProps) {
  return (
    <Box sx={{ mt: 3 }}>
      {newsLoading ? (
        <InlineLoading text="Loading news..." size="md" />
      ) : articles.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          {articles.slice(0, 6).map((article: ArticleRelation) => (
            <NewsCard key={article.id} article={article} />
          ))}
        </Box>
      ) : (
        <EmptyState
          icon={FileText}
          title="No news available"
          description={`Check back later for news about ${city.name}!`}
          mood="neutral"
        />
      )}
    </Box>
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
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} aria-label="Loading" />
        </Box>
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
