import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTrackView } from '@/hooks/useTrackView';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Luggage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { useToast } from '@/hooks/use-toast';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useVenueSocialSignals } from '@/hooks/useVenueSocialSignals';
import { useEvents } from '@/hooks/useEvents';
import { useTranslation } from 'react-i18next';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { TrendingStrip } from '@/components/discovery/TrendingStrip';
import { MarketplaceForVenue } from '@/components/marketplace/MarketplaceForVenue';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import { NotFoundMeta } from '@/components/seo/NotFoundMeta';
import { useMeta } from '@/hooks/useMeta';
import { buildVenueJsonLd, buildVenueMeta } from './VenueDetail.meta';
import {
  fetchVenue,
  type VenueWithRelations,
  type VenueReview,
  VenueHero,
  VenueOverview,
  VenueSidebar,
  buildVenueBreadcrumbs,
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
  useTrackView({
    type: 'venue',
    slug: venue?.slug,
    title: venue?.name,
    city: venue?.cities?.name,
    country: venue?.countries?.name,
  });
  const reviews: VenueReview[] = useMemo(() => data?.reviews ?? [], [data]);
  const notFound = data?.notFound ?? false;

  const averageRating = useMemo(
    () =>
      reviews.length
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0,
    [reviews],
  );
  const metaOptions = useMemo(
    () => (venue ? buildVenueMeta(venue) : null),
    [venue],
  );
  const jsonLd = useMemo(
    () =>
      venue
        ? buildVenueJsonLd(venue, {
            ratingValue: averageRating,
            ratingCount: reviews.length,
          })
        : null,
    [venue, averageRating, reviews.length],
  );
  useMeta(
    venue && metaOptions ? { ...metaOptions, jsonLd: jsonLd ?? undefined } : {},
  );

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

  const handleShare = async () => {
    if (!venue) return;
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

  // NotFound branch
  if (!isLoading && notFound) {
    const sectionSlugs = ['hotels', 'events', 'news', 'marketplace', 'travel', 'groups', 'resources'];
    const didYouMeanSection = slug && sectionSlugs.includes(slug) ? slug : null;
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <NotFoundMeta
          title={t('pages.venueDetail.notFoundTitle', 'Venue not found')}
        />
        <h1 className="text-xl font-bold mb-4">
          {t('pages.venueDetail.notFoundTitle', 'Venue not found')}
        </h1>
        <p className="text-muted-foreground mb-6">
          {t(
            'pages.venueDetail.notFoundBody',
            'No venue matches this URL. It may have been removed or the link is incorrect.',
          )}
        </p>
        {didYouMeanSection && (
          <p className="text-sm mb-6">
            {t('pages.venueDetail.didYouMean', 'Did you mean')}{' '}
            <LocalizedLink to={`/${didYouMeanSection}`} className="underline font-medium">
              /{didYouMeanSection}
            </LocalizedLink>
            ?
          </p>
        )}
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
        <h1 className="text-xl font-bold mb-4">Failed to Load</h1>
        <p className="text-muted-foreground mb-6">
          Could not load venue details. Check your connection and try again.
        </p>
        <div className="flex gap-4 justify-center">
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

  const cityName = venue?.cities?.name ?? null;
  const countryName = venue?.countries?.name ?? null;
  const cityLink = venue?.cities?.id ? `/city/${venue.cities.slug || venue.cities.id}` : null;
  const countryLink = venue?.countries?.id
    ? `/country/${venue.countries.slug || venue.countries.id}`
    : null;
  const heroImage = venue?.images && venue.images.length > 0 ? venue.images[0] : null;
  const isClosed = Boolean(venue?.closed_at && new Date(venue.closed_at) <= new Date());

  const breadcrumbs = buildVenueBreadcrumbs(venue);

  const tabs: EntityDetailTab[] = venue
    ? [
        {
          id: 'overview',
          label: t('pages.venueDetail.overview', 'Overview'),
          content: (
            <VenueOverview
              venue={venue}
              reviews={reviews}
              venueEvents={venueEvents}
              averageRating={averageRating}
              navigate={navigate}
              onContentUpdated={refetch}
              t={t}
            />
          ),
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
              onShare={handleShare}
              onCheckInSuccess={() => setCheckinRefresh((prev) => prev + 1)}
              onContentUpdated={refetch}
              t={t}
            />
          ) : null
        }
        tabs={tabs}
        sidebar={
          venue ? (
            <VenueSidebar
              venue={venue}
              checkinRefresh={checkinRefresh}
              onContentUpdated={refetch}
            />
          ) : undefined
        }
        entityType="venue"
        entityId={venue?.id}
      />

      {venue && (
        <>
          <div className="container mx-auto px-4 pb-28 md:pb-12">
            <MarketplaceForVenue venueId={venue.id} />
            {cityName && (
              <TrendingStrip
                city={cityName}
                types={['venue']}
                title="More venues"
                className="mt-10"
              />
            )}
            <SimilarItems entity={{ type: 'venue', id: venue.id }} className="mt-10" />
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

          {/* Sticky mobile action bar */}
          {!isClosed && (
            <div className="fixed inset-x-0 bottom-0 z-[1100] flex items-center gap-2 border-t border-border bg-background/95 p-4 backdrop-blur md:hidden">
              <Button className="flex-1" onClick={() => setAddToTripOpen(true)}>
                <Luggage size={16} className="mr-2" />
                Add to trip
              </Button>
              <FavoriteButton itemId={venue.id} type="venue" size="md" />
            </div>
          )}
        </>
      )}
    </>
  );
}
