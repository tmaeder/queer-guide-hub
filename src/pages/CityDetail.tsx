import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTrackView } from '@/hooks/useTrackView';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
import { TrendingStrip } from '@/components/discovery/TrendingStrip';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import { TripCoveringBanner } from '@/components/trips/TripCoveringBanner';
import { PlanTripFromHereButton } from '@/components/trips/PlanTripFromHereButton';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { GatedContentNotice } from '@/components/safety/GatedContentNotice';
import { EditorialDetailLayout, type SectionDef } from '@/components/entity/editorial';
import { CITY_SECTION_DEFS } from './city-detail/CitySectionDefs';
import { PersonalitiesForEntity } from '@/components/discovery/PersonalitiesForEntity';
import { NearbyTriptych } from '@/components/discovery/NearbyTriptych';
import {
  CityHero,
  CityAtAGlance,
  CityOverviewTab,
  CityRightsTab,
  CityVenuesTab,
  CityEventsTab,
  CityTravelTab,
  CityNewsTab,
  CityMapTab,
} from './CityDetail.parts';

const ExploreMap = lazy(() => import('@/components/map/ExploreMap'));

export default function CityDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const { toggleFavorite, isFavorited } = useFavorites('city');
  const { fetchCityImage } = useCityImages();
  const { articles, loading: newsLoading, fetchArticles } = useNews();
  const { city, loading, refetch: refetchCity } = useOptimizedCity(slug ?? '');
  useTrackView({
    type: 'city',
    slug: city?.slug,
    title: city?.name,
    image: resolveEntityImage('city', city).url ?? undefined,
    country: city?.countries?.name,
  });
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
    fetchVenuesRef.current({ cityId: city?.id, city: city?.name, limit: 12 });
  }, [city?.id, city?.name]);

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
        const result = await fetchCityImage(city.id, city.name, city.countries?.name || '', {
          existing: {
            image_url: city.image_url,
            curated_image_url: city.curated_image_url,
            image_flagged: city.image_flagged,
          },
        });
        if (result?.image_url) {
          setImageUrl(result.image_url);
          return;
        }
        // Miss: prefer a real gallery photo over the abstract texture fallback
        const { data } = await supabase.functions.invoke('get-pexels-images', {
          body: { query: city.name, type: 'city' },
        });
        const first = data?.images?.[0];
        setImageUrl(first?.url || first?.thumbnail || '');
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
        title: isFavorited(city.id)
          ? t('favorites.removedTitle', 'Removed from favorites')
          : t('favorites.addedTitle', 'Added to favorites'),
        description: isFavorited(city.id)
          ? t('favorites.removedDescription', '{{name}} removed from your favorites', { name: city.name })
          : t('favorites.addedDescription', '{{name}} added to your favorites', { name: city.name }),
      });
    } catch (_error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('favorites.updateFailed', 'Failed to update favorites'),
        variant: 'destructive',
      });
    }
  };

  if (loading) return <PageLoading text={t('city.loadingDetails', 'Loading city details...')} />;

  if (!city) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto px-4 py-8 text-center">
          <h5 className="text-xl font-bold mb-4">{t('city.notFoundTitle', 'City not found')}</h5>
          <p className="text-muted-foreground mb-6">
            {t('city.notFoundDescription', "The city you're looking for doesn't exist.")}
          </p>
          <LocalizedLink to="/places" className="font-medium" style={{ color: 'inherit' }}>
            {t('city.backToPlaces', '← Back to Places')}
          </LocalizedLink>
        </div>
      </div>
    );
  }

  const breadcrumbs = [
    { label: t('breadcrumb.places', 'Places'), href: '/places' },
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

  const hasCoords =
    typeof city.latitude === 'number' && typeof city.longitude === 'number';

  const seeAll = (href: string) => (
    <LocalizedLink
      to={href}
      className="group inline-flex items-center gap-1 text-13 font-medium text-muted-foreground transition-colors hover:text-foreground no-underline"
    >
      {t('cities.detail.seeAll', 'See all')}
      <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">
        →
      </span>
    </LocalizedLink>
  );

  const sectionContent: Record<string, React.ReactNode> = {
    rights: <CityRightsTab city={city} fullCountry={fullCountry} countryLoading={countryLoading} />,
    venues: (
      <CityVenuesTab
        city={city}
        venues={venues}
        venuesLoading={venuesLoading}
        villages={villages}
        villagesLoading={villagesLoading}
        showCreateTrip={Boolean(user)}
        onCreateTrip={() => setCreateTripOpen(true)}
      />
    ),
    events: <CityEventsTab city={city} events={events} eventsLoading={eventsLoading} />,
    map: hasCoords ? (
      <CityMapTab city={city} ExploreMap={ExploreMap} Suspense={Suspense} />
    ) : null,
    personalities: (
      <PersonalitiesForEntity
        cityId={city.id}
        countryId={city.countries?.id ?? null}
        cityName={city.name}
      />
    ),
    overview: <CityOverviewTab city={city} />,
    travel: (
      <CityTravelTab
        city={city}
        effectiveIata={effectiveIata}
        hasAirport={hasAirport}
        nearestAirport={nearestAirport}
      />
    ),
    news: <CityNewsTab city={city} articles={articles} newsLoading={newsLoading} />,
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

  const sectionAction: Record<string, React.ReactNode> = {
    venues: seeAll(`/venues?city=${encodeURIComponent(city.name)}`),
    events: seeAll(`/events?city=${encodeURIComponent(city.name)}`),
  };

  const sections: SectionDef[] = CITY_SECTION_DEFS.map((def) => ({
    id: def.id,
    label: def.heading,
    kicker: def.kicker,
    action: sectionAction[def.id],
    content: sectionContent[def.id] ?? null,
  })).filter((s) => s.content != null);

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
          <>
            <SafetyAlertBanner
              criminalization={
                city.countries?.lgbti_criminalization as Record<string, unknown> | null | undefined
              }
              countryName={city.countries?.name || ''}
            />
            <TripCoveringBanner
              target={{
                type: 'city',
                cityId: city.id,
                countryId: city.countries?.id ?? null,
              }}
            />
            <GatedContentNotice cityId={city.id} />
          </>
        }
        header={
          <div className="flex flex-col gap-6">
            <CityHero
              city={city}
              imageUrl={imageUrl}
              isFavorited={isFavorited(city.id)}
              onFavoriteToggle={handleFavoriteToggle}
              refetchCity={refetchCity}
            />
            <div className="flex flex-wrap items-center gap-4">
              <PlanTripFromHereButton
                initialGeo={planGeo}
                label={t('cities.detail.planTrip', 'Plan a trip to {{city}}', { city: city.name })}
              />
            </div>
            <CityAtAGlance city={city} hasAirport={hasAirport} effectiveIata={effectiveIata} />
          </div>
        }
        sections={sections}
        footer={
          <div className="flex flex-col gap-12">
            <TrendingStrip city={city.name} />
            <CityVenueGuidesRail cityId={city.id} />
            <MarketplaceForCity cityName={city.name} cityId={city.id} />
            <CityLocalSupporterCaption cityId={city.id} />
            <SimilarItems
              entity={{ type: 'city', id: city.id }}
              title={t('city.similarCities', 'Similar cities')}
              contentTypes={['city']}
            />
          </div>
        }
        entityType="city"
        entityId={city.id}
      />
      <CreateTripDialog open={createTripOpen} onClose={() => setCreateTripOpen(false)} />
    </>
  );
}
