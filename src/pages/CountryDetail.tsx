import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Globe } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { useWorldBankData } from '@/hooks/useWorldBankData';
import { useSDGData } from '@/hooks/useSDGData';
import { useOptimizedCountry, useOptimizedCities } from '@/hooks/useOptimizedPlaces';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useNews } from '@/hooks/useNews';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import {
  CountryHero,
  CountryOverviewTab,
  CountryRightsTab,
  CountryCitiesTab,
  CountryVenuesTab,
  CountryEventsTab,
  CountryTravelTab,
  CountryNewsTab,
  CountryMapTab,
  COUNTRY_TAB_DEFS,
  fetchCountryWeather,
  type WeatherDataType,
} from './CountryDetail.parts';

const ExploreMap = lazy(() => import('@/components/map/ExploreMap'));

export default function CountryDetail() {
  const { slug: countrySlug } = useParams<{ slug: string }>();
  useTranslation();
  const [weatherData, setWeatherData] = useState<WeatherDataType>(null);

  const { track } = useTrackEvent();
  const { country, loading: countryLoading } = useOptimizedCountry(countrySlug ?? '');
  const { cities, loading: citiesLoading } = useOptimizedCities({
    countryId: country?.id ?? '',
    limit: 12,
  });

  const { venues, loading: venuesLoading, fetchVenues: fetchCountryVenues } = useVenues(false);
  const {
    venues: cityVenues,
    loading: cityVenuesLoading,
    fetchVenues: fetchCityVenues,
  } = useVenues(false);

  const fetchCountryVenuesRef = useRef(fetchCountryVenues);
  const fetchCityVenuesRef = useRef(fetchCityVenues);
  fetchCountryVenuesRef.current = fetchCountryVenues;
  fetchCityVenuesRef.current = fetchCityVenues;

  useEffect(() => {
    if (country?.id) {
      track({
        eventType: 'page_view',
        entityType: 'country',
        entityId: country.id,
        metadata: { name: country.name },
      });
    }
  }, [country?.id, country?.name, track]);

  useEffect(() => {
    fetchCountryVenuesRef.current({ city: country?.name, limit: 12 });
  }, [country?.name]);

  useEffect(() => {
    fetchCityVenuesRef.current({ limit: 12 });
  }, []);

  const cityNames = cities.map((city) => city.name);

  const filteredCityVenues = useMemo(() => {
    if (!cityVenues || cityNames.length === 0) return [];
    return cityVenues.filter((venue) =>
      cityNames.some(
        (cityName) =>
          venue.city?.toLowerCase().includes(cityName.toLowerCase()) ||
          venue.address?.toLowerCase().includes(cityName.toLowerCase()),
      ),
    );
  }, [cityVenues, cityNames]);

  const countryVenues = useMemo(() => {
    const allVenues = [...(venues || []), ...filteredCityVenues];
    const uniqueVenues = allVenues.filter(
      (venue, index, self) => index === self.findIndex((v) => v.id === venue.id),
    );
    return uniqueVenues.slice(0, 12);
  }, [venues, filteredCityVenues]);

  const { events, loading: eventsLoading, fetchEvents } = useEvents(false);

  useEffect(() => {
    fetchEvents({ city: country?.name, limit: 12 });
  }, [country?.name, fetchEvents]);

  const { articles: localNews, loading: newsLoading, incrementViews } = useNews();
  const countryNews = useMemo(() => {
    if (!localNews || !country) return [];
    return localNews
      .filter(
        (article) =>
          article.country_ids?.includes(country.id) ||
          article.title.toLowerCase().includes(country.name.toLowerCase()) ||
          article.content?.toLowerCase().includes(country.name.toLowerCase()),
      )
      .slice(0, 12);
  }, [localNews, country]);

  const worldBankData = useWorldBankData(country);
  const sdgData = useSDGData(country);

  // Fetch weather data for header indicator
  useEffect(() => {
    if (!country) return;
    fetchCountryWeather(country).then((data) => {
      if (data) setWeatherData(data);
    });
  }, [country?.latitude, country?.longitude, country?.capital, country?.name, country]);

  if (!countrySlug) {
    return <Box>Country not found</Box>;
  }

  if (countryLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
            <Globe
              style={{
                height: 48,
                width: 48,
                margin: '0 auto',
                color: 'hsl(var(--muted-foreground))',
              }}
            />
          </Box>
          <Typography sx={{ color: 'text.secondary' }}>Loading country details...</Typography>
        </Box>
      </Box>
    );
  }

  if (!country) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h4" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
            Country not found
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            The country you're looking for doesn't exist.
          </Typography>
          <Button asChild>
            <LocalizedLink to="/users">
              <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
              Back to Directory
            </LocalizedLink>
          </Button>
        </Box>
      </Box>
    );
  }

  const breadcrumbs = [
    { label: 'Directory', href: '/users' },
    { label: country.name },
  ];

  const tabs: EntityDetailTab[] = COUNTRY_TAB_DEFS.map((def) => {
    let content: React.ReactNode = null;
    switch (def.id) {
      case 'overview':
        content = (
          <CountryOverviewTab
            country={country}
            worldBankData={worldBankData}
            sdgData={sdgData}
          />
        );
        break;
      case 'rights':
        content = <CountryRightsTab country={country} />;
        break;
      case 'cities':
        content = (
          <CountryCitiesTab country={country} cities={cities} citiesLoading={citiesLoading} />
        );
        break;
      case 'venues':
        content = (
          <CountryVenuesTab
            country={country}
            venues={countryVenues}
            loading={venuesLoading || cityVenuesLoading}
          />
        );
        break;
      case 'events':
        content = (
          <CountryEventsTab country={country} events={events} eventsLoading={eventsLoading} />
        );
        break;
      case 'travel':
        content = <CountryTravelTab country={country} />;
        break;
      case 'news':
        content = (
          <CountryNewsTab
            country={country}
            articles={countryNews}
            newsLoading={newsLoading}
            onViewArticle={incrementViews}
          />
        );
        break;
      case 'map':
        content = <CountryMapTab country={country} ExploreMap={ExploreMap} Suspense={Suspense} />;
        break;
    }
    return { id: def.id, label: def.label, content };
  });

  return (
    <>
      <SafetyAlertBanner
        criminalization={country.lgbti_criminalization as Record<string, unknown> | null}
        countryName={country.name}
      />
      <EntityDetailLayout
        loading={false}
        error={null}
        breadcrumbs={breadcrumbs}
        hero={<CountryHero country={country} cities={cities} weatherData={weatherData} />}
        tabs={tabs}
        entityType="country"
        entityId={country.id}
      />
    </>
  );
}
