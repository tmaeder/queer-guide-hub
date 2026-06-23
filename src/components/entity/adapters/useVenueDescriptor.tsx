import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Luggage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { useToast } from '@/hooks/use-toast';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useVenueSocialSignals } from '@/hooks/useVenueSocialSignals';
import { useEvents } from '@/hooks/useEvents';
import { useNearbyMapPoints } from '@/hooks/useNearbyMapPoints';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import {
  fetchVenue,
  VenueHero,
  VenueOverview,
  VenueSidebar,
  buildVenueBreadcrumbs,
  type VenueReview,
  type VenueWithRelations,
} from '@/pages/VenueDetail.parts';
import { buildVenueJsonLd, buildVenueMeta } from '@/pages/VenueDetail.meta';
import type { EntityDescriptor, EntityDescriptorResult } from '@/components/entity/entityDescriptor';

/**
 * Venue adapter: turns the raw venue query into a normalised `EntityDescriptor`.
 * Owns the add-to-trip dialog + check-in refresh state so the shell stays dumb.
 */
export function useVenueDescriptor(slug: string | undefined): EntityDescriptorResult {
  const navigate = useLocalizedNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [checkinRefresh, setCheckinRefresh] = useState(0);
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const { events } = useEvents();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['venue-detail', slug],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: async () => {
      const result = await fetchVenue(slug!);
      if (result.redirectTo) navigate(result.redirectTo, { replace: true });
      return result;
    },
  });

  const venue: VenueWithRelations | null = data?.venue ?? null;
  const reviews: VenueReview[] = useMemo(() => data?.reviews ?? [], [data]);
  const notFound = data?.notFound ?? false;
  const averageRating = useMemo(
    () => (reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0),
    [reviews],
  );

  const { data: tripStatus } = useEntityTripStatus('venue', venue?.id);
  const { data: socialSignals } = useVenueSocialSignals(venue?.id ? [venue.id] : []);
  const nearbyPoints = useNearbyMapPoints({
    lat: typeof venue?.latitude === 'number' ? venue.latitude : null,
    lng: typeof venue?.longitude === 'number' ? venue.longitude : null,
    excludeType: 'venue',
    excludeId: venue?.id ?? null,
  });

  useEffect(() => {
    if (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.venueDetail.loadFailed', 'Failed to load venue details.'),
        variant: 'destructive',
      });
    }
  }, [error, t, toast]);

  const descriptor: EntityDescriptor | null = useMemo(() => {
    if (!venue) return null;

    const cityName = venue.cities?.name ?? null;
    const countryName = venue.countries?.name ?? null;
    const cityLink = venue.cities?.id ? `/city/${venue.cities.slug || venue.cities.id}` : null;
    const countryLink = venue.countries?.id
      ? `/country/${venue.countries.slug || venue.countries.id}`
      : null;
    const isClosed = Boolean(venue.closed_at && new Date(venue.closed_at) <= new Date());
    const venueEvents = events.filter((e) => e.venue_id === venue.id);
    const lat = typeof venue.latitude === 'number' ? venue.latitude : null;
    const lng = typeof venue.longitude === 'number' ? venue.longitude : null;

    const handleShare = async () => {
      const shareUrl = window.location.href;
      if (navigator.share) {
        try {
          await navigator.share({ title: venue.name, url: shareUrl });
        } catch {
          /* user cancelled */
        }
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: t('pages.venueDetail.linkCopied', 'Link copied'),
          description: t('pages.venueDetail.linkCopiedDesc', 'Venue link copied to clipboard'),
        });
      }
    };

    const meta = buildVenueMeta(venue);
    const jsonLd = buildVenueJsonLd(venue, {
      ratingValue: averageRating,
      ratingCount: reviews.length,
    });

    return {
      source: 'venue',
      id: venue.id,
      slug: venue.slug ?? venue.id,
      title: venue.name,
      hero: (
        <VenueHero
          venue={venue}
          cityName={cityName}
          countryName={countryName}
          cityLink={cityLink}
          countryLink={countryLink}
          averageRating={averageRating}
          reviewCount={reviews.length}
          tripCount={tripStatus?.count}
          isInTrip={tripStatus?.isInTrip}
          socialSignal={socialSignals?.get(venue.id)}
          onAddToTrip={() => setAddToTripOpen(true)}
          onShare={handleShare}
          onCheckInSuccess={() => setCheckinRefresh((p) => p + 1)}
          onContentUpdated={refetch}
          t={t}
        />
      ),
      sections: [
        {
          id: 'overview',
          render: () => (
            <VenueOverview
              venue={venue}
              reviews={reviews}
              venueEvents={venueEvents}
              averageRating={averageRating}
              onContentUpdated={refetch}
              t={t}
            />
          ),
        },
      ],
      sidebar: (
        <VenueSidebar
          venue={venue}
          checkinRefresh={checkinRefresh}
          onContentUpdated={refetch}
          nearbyPoints={nearbyPoints}
        />
      ),
      related: { type: 'venue', id: venue.id, title: t('pages.entityDetail.moreVenues', 'More venues') },
      mobileBar: isClosed ? null : (
        <div className="fixed inset-x-0 bottom-0 z-[1100] flex items-center gap-2 border-t border-border bg-background/95 p-4 backdrop-blur md:hidden">
          <Button className="flex-1" onClick={() => setAddToTripOpen(true)}>
            <Luggage size={16} className="mr-2" />
            {t('pages.venueDetail.addToTrip', 'Add to trip')}
          </Button>
          <FavoriteButton itemId={venue.id} type="venue" size="md" />
        </div>
      ),
      overlays: (
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
      ),
      breadcrumbs: buildVenueBreadcrumbs(venue, t) ?? [],
      meta: { ...meta, jsonLd },
      personalization: {
        entityType: 'venue',
        entityId: venue.id,
        tags: (venue.tags ?? []).filter(Boolean),
        lat,
        lng,
        countryId: venue.country_id ?? null,
        countryName,
        criminalization: venue.countries?.lgbti_criminalization ?? null,
      },
      trackView: {
        type: 'venue',
        slug: venue.slug,
        title: venue.name,
        city: cityName ?? undefined,
        country: countryName ?? undefined,
      },
    };
  }, [
    venue,
    events,
    reviews,
    averageRating,
    tripStatus,
    socialSignals,
    nearbyPoints,
    checkinRefresh,
    addToTripOpen,
    refetch,
    toast,
    t,
  ]);

  return {
    descriptor,
    isLoading,
    error: error instanceof Error ? error : null,
    notFound,
    refetch,
  };
}
