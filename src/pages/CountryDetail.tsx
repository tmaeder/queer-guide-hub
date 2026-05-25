import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { useWorldBankData } from '@/hooks/useWorldBankData';
import { useSDGData } from '@/hooks/useSDGData';
import { useOptimizedCountry, useOptimizedCities } from '@/hooks/usePlaces';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useNews } from '@/hooks/useNews';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import {
  EditorialDetailLayout,
  IntroEssay,
  KeyFactsStrip,
  type KeyFact,
  type SectionDef,
} from '@/components/entity/editorial';
import { EDITORIAL_DETAIL_LAYOUT_ENABLED } from '@/lib/featureFlags';
import { TripCoveringBanner } from '@/components/trips/TripCoveringBanner';
import { PlanTripFromHereButton } from '@/components/trips/PlanTripFromHereButton';
import { COUNTRY_SECTION_DEFS } from './country-detail/CountrySectionDefs';
import { PersonalitiesForEntity } from '@/components/discovery/PersonalitiesForEntity';
import { NearbyTriptych } from '@/components/discovery/NearbyTriptych';
import { MarketplaceForCountry } from '@/components/marketplace/MarketplaceForCountry';
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
  const { country, loading: countryLoading, refetch: refetchCountry } = useOptimizedCountry(countrySlug ?? '');
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
    return <div>Country not found</div>;
  }

  if (countryLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center flex flex-col gap-4">
          <div className="animate-pulse">
            <Globe size={48} style={{ margin: '0 auto' }} className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Loading country details...</p>
        </div>
      </div>
    );
  }

  if (!country) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center flex flex-col gap-4">
          <h4 className="text-2xl font-bold">Country not found</h4>
          <p className="text-muted-foreground">The country you're looking for doesn't exist.</p>
          <Button asChild>
            <LocalizedLink to="/users">
              <ArrowLeft size={16} className="mr-2" />
              Back to Directory
            </LocalizedLink>
          </Button>
        </div>
      </div>
    );
  }

  const breadcrumbs = [{ label: 'Directory', href: '/users' }, { label: country.name }];

  const sectionContent: Record<string, React.ReactNode> = {
    overview: (
      <CountryOverviewTab country={country} worldBankData={worldBankData} sdgData={sdgData} />
    ),
    rights: <CountryRightsTab country={country} />,
    cities: (
      <CountryCitiesTab country={country} cities={cities} citiesLoading={citiesLoading} />
    ),
    venues: (
      <CountryVenuesTab
        country={country}
        venues={countryVenues}
        loading={venuesLoading || cityVenuesLoading}
      />
    ),
    events: (
      <CountryEventsTab country={country} events={events} eventsLoading={eventsLoading} />
    ),
    travel: <CountryTravelTab country={country} />,
    news: (
      <CountryNewsTab
        country={country}
        articles={countryNews}
        newsLoading={newsLoading}
        onViewArticle={incrementViews}
      />
    ),
    map: <CountryMapTab country={country} ExploreMap={ExploreMap} Suspense={Suspense} />,
    personalities: (
      <PersonalitiesForEntity countryId={country.id} cityName={country.name} />
    ),
    nearby: (
      <NearbyTriptych
        countryId={country.id}
        countryName={country.name}
        equalityScore={country.equality_score ?? null}
      />
    ),
  };

  const tabs: EntityDetailTab[] = COUNTRY_TAB_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    content: sectionContent[def.id] ?? null,
  }));

  if (EDITORIAL_DETAIL_LAYOUT_ENABLED) {
    const sections: SectionDef[] = COUNTRY_SECTION_DEFS.map((def) => ({
      id: def.id,
      label: def.label,
      content: sectionContent[def.id] ?? null,
    }));

    const languages = Array.isArray(country.languages)
      ? country.languages.slice(0, 3).join(', ')
      : country.languages || null;

    const facts: KeyFact[] = [
      { label: 'Capital', value: country.capital || null },
      {
        label: 'Population',
        value: country.population ? `${(country.population / 1e6).toFixed(1)}M` : null,
      },
      {
        label: 'Equality',
        value: country.equality_score != null ? `${country.equality_score}/10` : null,
      },
      { label: 'Languages', value: languages },
      { label: 'Currency', value: country.currency || null },
      { label: 'Cities', value: cities.length || null },
    ];

    return (
      <>
        <SafetyAlertBanner
          criminalization={country.lgbti_criminalization as Record<string, unknown> | null}
          countryName={country.name}
        />
        <EditorialDetailLayout
          loading={false}
          error={null}
          breadcrumbs={breadcrumbs}
          banner={<TripCoveringBanner target={{ type: 'country', countryId: country.id }} />}
          header={
            <div className="flex flex-col gap-8">
              <CountryHero
                country={country}
                cities={cities}
                weatherData={weatherData}
                onContentUpdated={refetchCountry}
              />
              <div className="flex flex-wrap gap-2">
                <PlanTripFromHereButton label={`Plan a trip to ${country.name}`} />
              </div>
              <IntroEssay text={country.description} />
              <KeyFactsStrip facts={facts} />
            </div>
          }
          sections={sections}
          footer={<MarketplaceForCountry countryId={country.id} countryName={country.name} />}
          entityType="country"
          entityId={country.id}
        />
      </>
    );
  }

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
        hero={<CountryHero country={country} cities={cities} weatherData={weatherData} onContentUpdated={refetchCountry} />}
        tabs={tabs}
        entityType="country"
        entityId={country.id}
      />
    </>
  );
}
