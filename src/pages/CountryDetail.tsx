import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTrackView } from '@/hooks/useTrackView';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { PageLoading } from '@/components/ui/loading';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { GatedContentNotice } from '@/components/safety/GatedContentNotice';
import { CountryHero } from '@/components/country/CountryHero';
import { SafetyVerdict } from '@/components/country/SafetyVerdict';
import { CountryPracticalInfo } from '@/components/country/CountryPracticalInfo';
import { CountryStatsBand } from '@/components/country/CountryStatsBand';
import { useWorldBankData } from '@/hooks/useWorldBankData';
import { useSDGData } from '@/hooks/useSDGData';
import { useOptimizedCountry, useOptimizedCities } from '@/hooks/usePlaces';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useNews } from '@/hooks/useNews';
import {
  EditorialDetailLayout,
  IntroEssay,
  KeyFactsStrip,
  type KeyFact,
  type SectionDef,
} from '@/components/entity/editorial';
import { TripCoveringBanner } from '@/components/trips/TripCoveringBanner';
import { PlanTripFromHereButton } from '@/components/trips/PlanTripFromHereButton';
import { COUNTRY_SECTION_DEFS } from './country-detail/CountrySectionDefs';
import { PersonalitiesForEntity } from '@/components/discovery/PersonalitiesForEntity';
import { NearbyTriptych } from '@/components/discovery/NearbyTriptych';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { MarketplaceForCountry } from '@/components/marketplace/MarketplaceForCountry';
import {
  CountryRightsTab,
  CountryCitiesTab,
  CountryVenuesTab,
  CountryEventsTab,
  CountryTravelTab,
  CountryNewsTab,
  CountryMapTab,
  fetchCountryWeather,
  type WeatherDataType,
} from './CountryDetail.parts';

const ExploreMap = lazy(() => import('@/components/map/ExploreMap'));

export default function CountryDetail() {
  const { slug: countrySlug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { track } = useTrackEvent();

  const { country, loading, refetch: refetchCountry } = useOptimizedCountry(countrySlug ?? '');

  useTrackView({
    type: 'country',
    slug: country?.slug,
    title: country?.name,
    image: resolveEntityImage('country', country).url ?? undefined,
    country: country?.name,
  });

  const { cities, loading: citiesLoading } = useOptimizedCities({
    countryId: country?.id ?? '',
    limit: 12,
  });
  const { venues, loading: venuesLoading, fetchVenues } = useVenues(false);
  const { events, loading: eventsLoading, fetchEvents } = useEvents(false);
  const { articles, loading: newsLoading, fetchArticles, incrementViews } = useNews();

  const worldBankData = useWorldBankData(country ?? null);
  const sdgData = useSDGData(country ?? null);

  const [weatherData, setWeatherData] = useState<WeatherDataType>(null);
  const fetchVenuesRef = useRef(fetchVenues);
  // eslint-disable-next-line react-hooks/refs -- "latest value" ref; effect reads .current.
  fetchVenuesRef.current = fetchVenues;

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
    if (country?.id) fetchVenuesRef.current({ countryId: country.id, limit: 12 });
  }, [country?.id]);

  useEffect(() => {
    if (country?.id) fetchEvents({ countryId: country.id, limit: 12 });
  }, [country?.id, fetchEvents]);

  useEffect(() => {
    if (country?.id) fetchArticles({ countryIds: [country.id] });
  }, [country?.id, fetchArticles]);

  // Weather chip for the hero.
  useEffect(() => {
    if (!country) return;
    let cancelled = false;
    fetchCountryWeather(country).then((data) => {
      if (!cancelled && data) setWeatherData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [country?.latitude, country?.longitude, country?.capital, country?.name, country]);

  // Placeholder / non-indexable countries stay reachable but never enter search.
  const isNoindex = !!country && country.seo_indexable === false;
  useEffect(() => {
    if (!isNoindex) return;
    let el = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const hadTag = !!el;
    const prev = el?.getAttribute('content') ?? null;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    el.setAttribute('content', 'noindex,nofollow');
    return () => {
      if (!hadTag) document.querySelector('meta[name="robots"]')?.remove();
      else if (prev !== null) el?.setAttribute('content', prev);
    };
  }, [isNoindex]);

  const hasCoords =
    !!country && typeof country.latitude === 'number' && typeof country.longitude === 'number';

  const hasStats = useMemo(
    () =>
      !!country &&
      (worldBankData?.hasData ||
        sdgData?.hasData ||
        country.gdp_per_capita_usd != null ||
        country.human_development_index != null ||
        country.life_expectancy != null ||
        country.literacy_rate != null ||
        !!country.wb_income_level),
    [country, worldBankData, sdgData],
  );

  if (loading) return <PageLoading text={t('country.loading', 'Loading country…')} />;

  if (!country) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto px-4 py-8 text-center">
          <h5 className="mb-4 text-xl font-bold">{t('country.notFound.title', 'Country not found')}</h5>
          <p className="mb-6 text-muted-foreground">
            {t('country.notFound.body', "The country you're looking for doesn't exist.")}
          </p>
          <LocalizedLink to="/places" className="font-medium" style={{ color: 'inherit' }}>
            ← {t('country.notFound.back', 'Back to Places')}
          </LocalizedLink>
        </div>
      </div>
    );
  }

  const breadcrumbs = [
    { label: t('country.breadcrumb.places', 'Places'), href: '/places' },
    { label: country.name },
  ];

  const facts: KeyFact[] = [
    { label: t('country.facts.capital', 'Capital'), value: country.capital || null },
    {
      label: t('country.facts.population', 'Population'),
      value: country.population ? `${(country.population / 1e6).toFixed(1)}M` : null,
    },
    {
      label: t('country.facts.equality', 'Equality'),
      value: country.equality_score != null ? `${country.equality_score}/100` : null,
    },
    {
      label: t('country.facts.languages', 'Languages'),
      value: Array.isArray(country.languages)
        ? country.languages.slice(0, 3).join(', ')
        : country.languages || null,
    },
    { label: t('country.facts.currency', 'Currency'), value: country.currency || null },
    { label: t('country.facts.cities', 'Cities'), value: cities.length || null },
  ];

  const sectionContent: Record<string, React.ReactNode> = {
    rights: <CountryRightsTab country={country} />,
    cities: (
      <CountryCitiesTab
        cities={cities}
        citiesLoading={citiesLoading}
        emptyTitle={t('country.cities.emptyTitle', 'No cities yet')}
        emptyDescription={t('country.cities.emptyBody', 'No cities are listed for this country yet.')}
      />
    ),
    venues: (
      <CountryVenuesTab
        venues={venues}
        loading={venuesLoading}
        emptyTitle={t('country.venues.emptyTitle', 'No venues yet')}
        emptyDescription={t('country.venues.emptyBody', {
          defaultValue: 'Be the first to add a venue in {{country}}.',
          country: country.name,
        })}
      />
    ),
    events: (
      <CountryEventsTab
        events={events}
        eventsLoading={eventsLoading}
        emptyTitle={t('country.events.emptyTitle', 'No upcoming events')}
        emptyDescription={t('country.events.emptyBody', 'No events are scheduled for this country yet.')}
      />
    ),
    travel: (
      <CountryTravelTab
        country={country}
        activitiesTitle={t('country.travel.activities', 'Activities & tours')}
        activitiesDescription={t('country.travel.activitiesBody', {
          defaultValue: 'Experiences in {{country}}',
          country: country.name,
        })}
      />
    ),
    stats: <CountryStatsBand country={country} worldBankData={worldBankData} sdgData={sdgData} />,
    personalities: <PersonalitiesForEntity countryId={country.id} cityName={country.name} />,
    nearby: (
      <NearbyTriptych
        countryId={country.id}
        countryName={country.name}
        equalityScore={country.equality_score ?? null}
      />
    ),
    news: (
      <CountryNewsTab
        articles={articles}
        newsLoading={newsLoading}
        onViewArticle={incrementViews}
        emptyTitle={t('country.news.emptyTitle', 'No local news yet')}
        emptyDescription={t('country.news.emptyBody', 'No news articles are available for this country yet.')}
      />
    ),
    map: <CountryMapTab country={country} ExploreMap={ExploreMap} Suspense={Suspense} />,
  };

  const omit = new Set<string>();
  if (!hasStats) omit.add('stats');
  if (!hasCoords) omit.add('map');

  const sections: SectionDef[] = COUNTRY_SECTION_DEFS.filter((def) => !omit.has(def.id)).map((def) => ({
    id: def.id,
    label: t(`country.section.${def.id}`, def.label),
    content: sectionContent[def.id] ?? null,
  }));

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
        banner={
          <>
            <TripCoveringBanner target={{ type: 'country', countryId: country.id }} />
            <GatedContentNotice countryId={country.id} />
          </>
        }
        header={
          <div className="flex flex-col gap-8">
            <CountryHero country={country} weatherData={weatherData} onContentUpdated={refetchCountry} />
            <SafetyVerdict
              countryId={country.id}
              equalityScore={country.equality_score ?? null}
            />
            <div className="flex flex-wrap gap-2">
              <PlanTripFromHereButton
                initialGeo={null}
                label={t('country.planTrip', {
                  defaultValue: 'Plan a trip to {{country}}',
                  country: country.name,
                })}
              />
            </div>
            <IntroEssay text={country.editorial_long || country.description} />
            <CountryPracticalInfo country={country} />
            <KeyFactsStrip facts={facts} />
          </div>
        }
        sections={sections}
        footer={
          <div className="flex flex-col gap-8">
            <MarketplaceForCountry countryId={country.id} countryName={country.name} />
            <SimilarItems
              entity={{ type: 'country', id: country.id }}
              title={t('country.similar', 'More destinations')}
              contentTypes={['country']}
            />
          </div>
        }
        entityType="country"
        entityId={country.id}
      />
    </>
  );
}
