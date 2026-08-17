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
  VenueActions,
  VenueBodyLead,
  VenueFacts,
  VenueAbout,
  VenueRunBy,
  VenueAmenities,
  VenueWhatsOn,
  VenuePhotos,
  VenueTags,
  VenueGuides,
  VenueSignals,
  VenueReviews,
  hasUsableHours,
  formatHours,
  VenueSidebar,
  buildVenueBreadcrumbs,
  type VenueReview,
  type VenueWithRelations,
} from '@/pages/VenueDetail.parts';
import { buildVenueJsonLd, buildVenueMeta } from '@/pages/VenueDetail.meta';
import type {
  EntityDescriptor,
  EntityDescriptorResult,
} from '@/components/entity/entityDescriptor';

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

  // Called for the fetch, not the value: these warm the react-query cache so the
  // trip-status and social-signal children read it instead of refetching. The
  // descriptor below never reads either one, so they are deliberately not bound
  // and not listed as memo dependencies — listing them recomputed the whole
  // descriptor every time a signal refreshed.
  useEntityTripStatus('venue', venue?.id);
  useVenueSocialSignals(venue?.id ? [venue.id] : []);
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
      // `EntitySingle` builds the masthead from `single`; `hero` is only read
      // by the legacy scroll shell, which venue no longer uses.
      hero: null,
      // Spec module order for `venue`: 01 fact strip, 02 hours (the OWNER
      // module), 03 occurrences, 04 access, 08 nested entity, 16 map inset.
      //
      // Module 02 is the type's owner and renders for 626 of 23,335 live
      // venues — 2.7%. `venues.hours` is free-form jsonb that only the scraper
      // path fills. It is not faked for the other 97.3%; the section is simply
      // absent, and the gap is written down rather than papered over.
      // Module 04 is worse: 6 venues have `accessibility_attributes` at all.
      sections: [
        {
          id: 'about',
          title: t('venues.detail.section.about', 'About'),
          when: Boolean(venue.description),
          render: () => <VenueAbout venue={venue} onContentUpdated={refetch} />,
        },
        {
          id: 'hours',
          title: t('venues.detail.section.hours', 'Opening hours'),
          when: hasUsableHours(venue.hours),
          render: () => formatHours(venue.hours),
        },
        {
          // `when` is REQUIRED here, not optional tidiness. `VenueAmenities`
          // returns null from its own body, and the section filter cannot see
          // that — so this rendered an "Access" heading with ZERO content on
          // every venue with no amenities, which is 91% of them (and 99.97%
          // for accessibility specifically). Shipped, caught on prod.
          id: 'access',
          title: t('venues.detail.section.access', 'Access'),
          when:
            (venue.amenities?.length ?? 0) > 0 ||
            (venue.accessibility_attributes?.length ?? 0) > 0 ||
            Boolean(venue.accessibility_notes),
          render: () => <VenueAmenities venue={venue} />,
        },
        {
          id: 'whatson',
          title: t('venues.detail.section.whatsOn', "What's on here"),
          when: venueEvents.length > 0,
          render: () => <VenueWhatsOn venue={venue} venueEvents={venueEvents} />,
        },
        {
          id: 'runby',
          title: t('venues.detail.runBy', 'Run by'),
          when: Boolean(venue.organizations),
          render: () => <VenueRunBy venue={venue} t={t} />,
        },
        {
          id: 'signals',
          title: t('venues.detail.section.signals', 'Visitor signals'),
          render: () => <VenueSignals venue={venue} />,
        },
        {
          id: 'reviews',
          title: t('venues.detail.section.reviews', 'Reviews'),
          when: reviews.length > 0,
          render: () => <VenueReviews reviews={reviews} averageRating={averageRating} />,
        },
        {
          id: 'photos',
          title: t('venues.detail.section.photos', 'Photos'),
          when: (venue.images?.length ?? 0) > 0,
          render: () => <VenuePhotos venue={venue} onContentUpdated={refetch} />,
        },
      ],
      single: {
        eyebrow: [t('venues.detail.eyebrow', 'Venue'), cityName].filter(Boolean).join(' · '),
        status: isClosed ? t('venues.detail.closed', 'Permanently closed') : undefined,
        track: 'pink',
        bodyLead: (
          <>
            <VenueBodyLead venue={venue} />
            {/* Self-hides when the venue is in no guide, so it stays out of
                `sections` — a station pointing at nothing is a dead stop. */}
            <VenueGuides venue={venue} />
          </>
        ),
        tags: (
          <div className="flex flex-col gap-4">
            <VenueFacts venue={venue} t={t} />
            <VenueTags venue={venue} onContentUpdated={refetch} />
          </div>
        ),
        action: (
          <VenueActions
            venue={venue}
            onAddToTrip={() => setAddToTripOpen(true)}
            onShare={handleShare}
            onCheckInSuccess={() => setCheckinRefresh((p) => p + 1)}
            t={t}
          />
        ),
        rail: (
          <VenueSidebar
            venue={venue}
            checkinRefresh={checkinRefresh}
            onContentUpdated={refetch}
            nearbyPoints={nearbyPoints}
          />
        ),
      },
      sidebar: null,
      related: {
        type: 'venue',
        id: venue.id,
        title: t('pages.entityDetail.moreVenues', 'More venues'),
      },
      mobileBar: isClosed ? null : (
        <div className="fixed inset-x-0 bottom-0 z-[1100] flex items-center gap-2 bg-background/95 p-4 backdrop-blur md:hidden">
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
        image: venue.images?.[0] ?? venue.logo_url ?? undefined,
        city: cityName ?? undefined,
        country: countryName ?? undefined,
      },
    };
  }, [
    venue,
    events,
    reviews,
    averageRating,
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
