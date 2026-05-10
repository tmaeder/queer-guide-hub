import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
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
import { TrendingStrip } from '@/components/discovery/TrendingStrip';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
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
} from './CityDetail.parts';

const ExploreMap = lazy(() => import('@/components/map/ExploreMap'));

export default function CityDetail() {
  useTranslation();
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

  const tabs: EntityDetailTab[] = CITY_TAB_DEFS.map((def) => {
    let content: React.ReactNode = null;
    switch (def.id) {
      case 'overview':
        content = (
          <CityOverviewTab
            city={city}
            villages={villages}
            villagesLoading={villagesLoading}
            hasAirport={hasAirport}
            effectiveIata={effectiveIata}
            nearestAirport={nearestAirport}
          />
        );
        break;
      case 'rights':
        content = (
          <CityRightsTab city={city} fullCountry={fullCountry} countryLoading={countryLoading} />
        );
        break;
      case 'venues':
        content = (
          <CityVenuesTab
            city={city}
            venues={venues}
            venuesLoading={venuesLoading}
            showCreateTrip={Boolean(user)}
            onCreateTrip={() => setCreateTripOpen(true)}
          />
        );
        break;
      case 'events':
        content = <CityEventsTab city={city} events={events} eventsLoading={eventsLoading} />;
        break;
      case 'travel':
        content = (
          <CityTravelTab
            city={city}
            effectiveIata={effectiveIata}
            hasAirport={hasAirport}
            nearestAirport={nearestAirport}
          />
        );
        break;
      case 'news':
        content = <CityNewsTab city={city} articles={articles} newsLoading={newsLoading} />;
        break;
      case 'map':
        content = <CityMapTab city={city} ExploreMap={ExploreMap} Suspense={Suspense} />;
        break;
    }
    return { id: def.id, label: def.label, content };
  });

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

      <div className="mx-auto px-4 pb-8">
        <TrendingStrip city={city.name} className="mt-8" />
        <SimilarItems
          entity={{ type: 'city', id: city.id }}
          className="mt-6"
          title="Similar cities"
        />
      </div>

      <CreateTripDialog open={createTripOpen} onClose={() => setCreateTripOpen(false)} />
    </>
  );
}
