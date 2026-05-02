import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useVenueSocialSignals } from '@/hooks/useVenueSocialSignals';
import { useEvents } from '@/hooks/useEvents';
import { useTranslation } from 'react-i18next';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import {
  fetchVenue,
  type VenueWithRelations,
  type VenueReview,
  VenueHero,
  VenueOverview,
  VenuePhotos,
  VenueEventsTab,
  VenueReviewsTab,
} from './VenueDetail.parts';

export default function VenueDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useLocalizedNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [checkinRefresh, setCheckinRefresh] = useState(0);
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const { events } = useEvents();
  const { track } = useTrackEvent();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['venue-detail', slug],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: async () => {
      const result = await fetchVenue(slug!);
      if (result.redirectTo) {
        navigate(result.redirectTo, { replace: true });
      }
      return result;
    },
  });

  const venue: VenueWithRelations | null = data?.venue ?? null;
  const reviews: VenueReview[] = data?.reviews ?? [];
  const notFound = data?.notFound ?? false;

  const { data: tripStatus } = useEntityTripStatus('venue', venue?.id);
  const { data: socialSignals } = useVenueSocialSignals(venue?.id ? [venue.id] : []);

  useEffect(() => {
    if (venue?.id) {
      track({
        eventType: 'page_view',
        entityType: 'venue',
        entityId: venue.id,
        metadata: { name: venue.name },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue?.id]);

  useEffect(() => {
    if (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.venueDetail.loadFailed', 'Failed to load venue details.'),
        variant: 'destructive',
      });
    }
  }, [error, t, toast]);

  // NotFound branch
  if (!isLoading && notFound) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h5 className="text-xl font-bold mb-4">
          {t('pages.venueDetail.notFoundTitle', 'Venue not found')}
        </h5>
        <p className="text-muted-foreground mb-6">
          {t(
            'pages.venueDetail.notFoundBody',
            'No venue matches this URL. It may have been removed or the link is incorrect.',
          )}
        </p>
        <LocalizedLink to="/venues">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('pages.venueDetail.backToVenues', 'Back to Venues')}
          </Button>
        </LocalizedLink>
      </div>
    );
  }

  if (!isLoading && error && !venue) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h5 className="text-xl font-bold mb-4">Failed to Load</h5>
        <p className="text-muted-foreground mb-6">
          Could not load venue details. Check your connection and try again.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <LocalizedLink to="/venues">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Venues
            </Button>
          </LocalizedLink>
        </div>
      </div>
    );
  }

  const venueEvents = venue ? events.filter((event) => event.venue_id === venue.id) : [];

  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  const cityName = venue?.cities?.name ?? venue?.city ?? null;
  const countryName = venue?.countries?.name ?? venue?.country ?? null;
  const cityLink = venue?.cities?.id ? `/city/${venue.cities.slug || venue.cities.id}` : null;
  const countryLink = venue?.countries?.id
    ? `/country/${venue.countries.slug || venue.countries.id}`
    : null;
  const heroImage = venue?.images && venue.images.length > 0 ? venue.images[0] : null;
  const remainingImages =
    venue?.images && venue.images.length > 1 ? venue.images.slice(1) : venue?.images || [];

  const breadcrumbs = venue
    ? [
        { label: 'Venues', href: '/venues' },
        ...(countryName ? [{ label: countryName, href: countryLink ?? undefined }] : []),
        ...(cityName ? [{ label: cityName, href: cityLink ?? undefined }] : []),
        { label: venue.name },
      ]
    : undefined;

  const tabs: EntityDetailTab[] = venue
    ? [
        {
          id: 'overview',
          label: t('pages.venueDetail.overview', 'Overview'),
          content: (
            <VenueOverview
              venue={venue}
              checkinRefresh={checkinRefresh}
              navigate={navigate}
              t={t}
            />
          ),
        },
        ...(remainingImages.length > 0 || heroImage
          ? [
              {
                id: 'photos',
                label: `Photos ${venue.images && venue.images.length > 0 ? `(${venue.images.length})` : ''}`,
                content: <VenuePhotos venue={venue} t={t} />,
              },
            ]
          : []),
        ...(venueEvents.length > 0
          ? [
              {
                id: 'events',
                label: `Events (${venueEvents.length})`,
                content: <VenueEventsTab venue={venue} venueEvents={venueEvents} t={t} />,
              },
            ]
          : []),
        {
          id: 'reviews',
          label: `Reviews (${reviews.length})`,
          content: <VenueReviewsTab reviews={reviews} />,
        },
      ]
    : [];

  return (
    <>
      <EntityDetailLayout
        loading={isLoading}
        error={null}
        breadcrumbs={breadcrumbs}
        hero={
          venue ? (
            <VenueHero
              venue={venue}
              cityName={cityName}
              countryName={countryName}
              cityLink={cityLink}
              countryLink={countryLink}
              heroImage={heroImage}
              averageRating={averageRating}
              reviewCount={reviews.length}
              tripCount={tripStatus?.count}
              isInTrip={tripStatus?.isInTrip}
              socialSignal={socialSignals?.get(venue.id)}
              onAddToTrip={() => setAddToTripOpen(true)}
              onCheckInSuccess={() => setCheckinRefresh((prev) => prev + 1)}
              t={t}
            />
          ) : null
        }
        tabs={tabs}
        entityType="venue"
        entityId={venue?.id}
      />

      {venue && (
        <>
          <div className="container mx-auto pb-8 px-4">
            <SimilarItems entity={{ type: 'venue', id: venue.id }} className="mt-8" />
          </div>

          <AddToTripDialog
            open={addToTripOpen}
            onClose={() => setAddToTripOpen(false)}
            entity={{
              type: 'venue',
              id: venue.id,
              name: venue.name,
              latitude: venue.latitude,
              longitude: venue.longitude,
              city_id: venue.city_id,
              country_id: venue.country_id,
              address: venue.address,
              category: venue.category,
            }}
          />
        </>
      )}
    </>
  );
}
