import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useContentLang, localizedField } from '@/lib/localizeContent';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { useCityImages } from '@/hooks/useCityImages';
import { useNews } from '@/hooks/useNews';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useOptimizedCountry, useOptimizedCity } from '@/hooks/usePlaces';
import { useQueerVillages } from '@/hooks/useQueerVillages';
import { useNearestAirport } from '@/hooks/useNearestAirport';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { PageLoading } from '@/components/ui/loading';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { MarketplaceForCity } from '@/components/marketplace/MarketplaceForCity';
import { CityLocalSupporterCaption } from '@/components/marketplace/CityLocalSupporterCaption';
import { CityVenueGuidesRail } from '@/components/venues/VenueFeaturedInGuides';
import { TracingBeam } from '@/components/effects/TracingBeam';
import { TrendingStrip } from '@/components/discovery/TrendingStrip';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import { TripCoveringBanner } from '@/components/trips/TripCoveringBanner';
import { PlanTripFromHereButton } from '@/components/trips/PlanTripFromHereButton';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import {
  EditorialDetailLayout,
  IntroEssay,
  KeyFactsStrip,
  type KeyFact,
  type SectionDef,
} from '@/components/entity/editorial';
import { EDITORIAL_DETAIL_LAYOUT_ENABLED } from '@/lib/featureFlags';
import { CITY_SECTION_DEFS } from './city-detail/CitySectionDefs';
import { PersonalitiesForEntity } from '@/components/discovery/PersonalitiesForEntity';
import { NearbyTriptych } from '@/components/discovery/NearbyTriptych';
import {
  CityHero,
  CityOverviewTab,
  CityRightsTab,
  CityVenuesTab,
  CityEventsTab,
  CityTravelTab,
  CityNewsTab,
  CityMapTab,
  CITY_TAB_DEFS,
  formatPopulation,
} from './CityDetail.parts';

const ExploreMap = lazy(() => import('@/components/map/ExploreMap'));

export default function CityDetail() {
  useTranslation();
  const lang = useContentLang();
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const { toggleFavorite, isFavorited } = useFavorites('city');
  const { fetchCityImage } = useCityImages();
  const { articles, loading: newsLoading, fetchArticles } = useNews();
  const { city, loading, refetch: refetchCity } = useOptimizedCity(slug ?? '');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [createTripOpen, setCreateTripOpen] = useState(false);
  const { user } = useAuth();
  const { track } = useTrackEvent();

  useEffect(() => {
    if (city?.id) {
      track({
        eventType: 'page_view',
        entityType: 'city',
        entityId: city.id,
        metadata: { name: city.name },
      });
    }
  }, [city?.id, city?.name, track]);

  // Placeholder ("tmp-") cities are auto-created ingest stubs, excluded from maps,
  // listings, and search. Keep the page reachable (e.g. personality-birthplace links)
  // but mark it noindex so it never enters search results.
  const isPlaceholderCity = !!city && (city.slug?.startsWith('tmp-') || city.seo_indexable === false);
  useEffect(() => {
    if (!isPlaceholderCity) return;
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
  }, [isPlaceholderCity]);

  const hasAirport = !!(
    city?.major_airport_code ||
    (city?.airport_codes && city.airport_codes.length > 0)
  );
  const { nearestAirport } = useNearestAirport({
    latitude: city?.latitude ?? null,
    longitude: city?.longitude ?? null,
    hasAirport,
  });
  const effectiveIata = city?.major_airport_code || nearestAirport?.iata_code || null;

  const { venues, loading: venuesLoading, fetchVenues } = useVenues(false);
  const { events, loading: eventsLoading, fetchEvents } = useEvents(false);
  const fetchVenuesRef = useRef(fetchVenues);
  // eslint-disable-next-line react-hooks/refs -- "latest value" ref pattern; effect below reads .current.
  fetchVenuesRef.current = fetchVenues;

  useEffect(() => {
    fetchVenuesRef.current({ city: city?.name, limit: 12 });
  }, [city?.name]);

  useEffect(() => {
    fetchEvents({ city: city?.name, limit: 12 });
  }, [city?.name, fetchEvents]);

  const { country: fullCountry, loading: countryLoading } = useOptimizedCountry(
    city?.countries?.slug || city?.countries?.id || '',
  );
  const { villages, loading: villagesLoading, fetchVillages } = useQueerVillages(false);

  useEffect(() => {
    if (!city) return;
    (async () => {
      try {
        const result = await fetchCityImage(city.id, city.name, city.countries?.name || '');
        setImageUrl(result.image_url || '');
      } catch {
        // Image loading failure is non-critical, fallback to no image
      }
    })();
    fetchArticles({
      cityIds: [city.id],
      countryIds: city.countries?.id ? [city.countries.id] : undefined,
    });
  }, [city, fetchCityImage, fetchArticles]);

  useEffect(() => {
    if (city?.id) fetchVillages({ cityId: city.id });
  }, [city?.id, fetchVillages]);

  const handleFavoriteToggle = async () => {
    if (!city) return;
    try {
      await toggleFavorite(city.id);
      toast({
        title: isFavorited(city.id) ? 'Removed from favorites' : 'Added to favorites',
        description: `${city.name} ${isFavorited(city.id) ? 'removed from' : 'added to'} your favorites`,
      });
    } catch (_error) {
      toast({ title: 'Error', description: 'Failed to update favorites', variant: 'destructive' });
    }
  };

  if (loading) return <PageLoading text="Loading city details..." />;

  if (!city) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto px-4 py-8 text-center">
          <h5 className="text-xl font-bold mb-4">City Not Found</h5>
          <p className="text-muted-foreground mb-6">
            The city you're looking for doesn't exist.
          </p>
          <LocalizedLink to="/places" className="font-medium" style={{ color: 'inherit' }}>
            ← Back to Places
          </LocalizedLink>
        </div>
      </div>
    );
  }

  const breadcrumbs = [
    { label: 'Places', href: '/places' },
    ...(city.countries
      ? [
          {
            label: city.countries.name,
            href: `/country/${city.countries.slug || city.countries.id}`,
          },
        ]
      : []),
    { label: city.name },
  ];

  const sectionContent: Record<string, React.ReactNode> = {
    overview: (
      <CityOverviewTab
        city={city}
        villages={villages}
        villagesLoading={villagesLoading}
        hasAirport={hasAirport}
        effectiveIata={effectiveIata}
        nearestAirport={nearestAirport}
      />
    ),
    rights: (
      <CityRightsTab city={city} fullCountry={fullCountry} countryLoading={countryLoading} />
    ),
    venues: (
      <CityVenuesTab
        city={city}
        venues={venues}
        venuesLoading={venuesLoading}
        showCreateTrip={Boolean(user)}
        onCreateTrip={() => setCreateTripOpen(true)}
      />
    ),
    events: <CityEventsTab city={city} events={events} eventsLoading={eventsLoading} />,
    travel: (
      <CityTravelTab
        city={city}
        effectiveIata={effectiveIata}
        hasAirport={hasAirport}
        nearestAirport={nearestAirport}
      />
    ),
    news: <CityNewsTab city={city} articles={articles} newsLoading={newsLoading} />,
    map: <CityMapTab city={city} ExploreMap={ExploreMap} Suspense={Suspense} />,
    personalities: (
      <PersonalitiesForEntity
        cityId={city.id}
        countryId={city.countries?.id ?? null}
        cityName={city.name}
      />
    ),
    nearby: (
      <NearbyTriptych
        cityId={city.id}
        latitude={city.latitude != null ? Number(city.latitude) : null}
        longitude={city.longitude != null ? Number(city.longitude) : null}
        countryId={city.countries?.id ?? null}
        countryName={city.countries?.name ?? null}
        equalityScore={city.countries?.equality_score ?? null}
      />
    ),
  };

  const tabs: EntityDetailTab[] = CITY_TAB_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    content: sectionContent[def.id] ?? null,
  }));

  if (EDITORIAL_DETAIL_LAYOUT_ENABLED) {
    const sections: SectionDef[] = CITY_SECTION_DEFS.map((def) => ({
      id: def.id,
      label: def.label,
      content: sectionContent[def.id] ?? null,
    }));

    const facts: KeyFact[] = [
      { label: 'Population', value: city.population ? formatPopulation(city.population) : null },
      {
        label: 'Equality',
        value:
          city.countries?.equality_score != null ? `${city.countries.equality_score}/10` : null,
      },
      { label: 'Language', value: city.local_language || null },
      { label: 'Currency', value: city.countries?.currency || null },
      { label: 'Timezone', value: city.timezone || null },
      {
        label: hasAirport ? 'Airport' : 'Nearest airport',
        value: effectiveIata || null,
      },
    ];

    const planGeo = city.countries?.id
      ? {
          cityId: city.id,
          cityName: city.name,
          countryId: city.countries.id,
          countryName: city.countries.name ?? '',
          countryCode: city.countries.code ?? null,
          timezone: city.timezone ?? null,
        }
      : null;

    return (
      <>
        <EditorialDetailLayout
          loading={false}
          error={null}
          breadcrumbs={breadcrumbs}
          banner={
            <TripCoveringBanner
              target={{
                type: 'city',
                cityId: city.id,
                countryId: city.countries?.id ?? null,
              }}
            />
          }
          header={
            <div className="flex flex-col gap-8">
              <CityHero
                city={city}
                imageUrl={imageUrl}
                isFavorited={isFavorited(city.id)}
                hasAirport={hasAirport}
                effectiveIata={effectiveIata}
                onFavoriteToggle={handleFavoriteToggle}
                refetchCity={refetchCity}
              />
              <div className="flex flex-wrap gap-2">
                <PlanTripFromHereButton
                  initialGeo={planGeo}
                  label={`Plan a trip to ${city.name}`}
                />
              </div>
              <IntroEssay text={localizedField(city as unknown as Record<string, unknown>, 'description', lang)} />
              <KeyFactsStrip facts={facts} />
            </div>
          }
          sections={sections}
          footer={
            <TracingBeam className="px-0 pb-8">
              <TrendingStrip city={city.name} className="mt-8" />
              <CityVenueGuidesRail cityId={city.id} />
              <MarketplaceForCity cityName={city.name} />
              <CityLocalSupporterCaption cityId={city.id} />
              <SimilarItems
                entity={{ type: 'city', id: city.id }}
                className="mt-6"
                title="Similar cities"
                contentTypes={['city']}
              />
            </TracingBeam>
          }
          entityType="city"
          entityId={city.id}
        />
        <CreateTripDialog open={createTripOpen} onClose={() => setCreateTripOpen(false)} />
      </>
    );
  }

  return (
    <>
      <EntityDetailLayout
        loading={false}
        error={null}
        breadcrumbs={breadcrumbs}
        hero={
          <CityHero
            city={city}
            imageUrl={imageUrl}
            isFavorited={isFavorited(city.id)}
            hasAirport={hasAirport}
            effectiveIata={effectiveIata}
            onFavoriteToggle={handleFavoriteToggle}
            refetchCity={refetchCity}
          />
        }
        tabs={tabs}
        entityType="city"
        entityId={city.id}
      />

      <TracingBeam className="container mx-auto px-4 pb-8">
        <TrendingStrip city={city.name} className="mt-8" />
        <MarketplaceForCity cityName={city.name} />
        <CityLocalSupporterCaption cityId={city.id} />
        <SimilarItems
          entity={{ type: 'city', id: city.id }}
          className="mt-6"
          title="Similar cities"
          contentTypes={['city']}
        />
      </TracingBeam>

      <CreateTripDialog open={createTripOpen} onClose={() => setCreateTripOpen(false)} />
    </>
  );
}
