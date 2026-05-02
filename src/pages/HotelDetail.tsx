import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useHotelByIdFallback } from '@/hooks/usePageFetchers';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { supabase } from '@/integrations/supabase/client';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useTranslation } from 'react-i18next';
import { useEntityDetail } from '@/hooks/useEntityDetail';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import {
  HotelHero,
  HotelOverview,
  HotelSidebar,
  HotelPhotos,
  type HotelWithRelations,
} from './HotelDetail.parts';

const JOIN_SPEC = '*, cities:city_id(id, name), countries:country_id(id, name)';

export default function HotelDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [addToTripOpen, setAddToTripOpen] = useState(false);

  const {
    data: primary,
    isLoading: primaryLoading,
    error: primaryError,
  } = useEntityDetail<HotelWithRelations>({
    table: 'hotels',
    slug,
    joinSpec: JOIN_SPEC,
    queryKey: 'hotel-detail',
  });

  // Fallback: slug param may be a uuid; if slug lookup yields no row, try by id.
  const { data: fallback, isLoading: fallbackLoading } = useHotelByIdFallback<HotelWithRelations>(
    JOIN_SPEC,
    slug,
    !primaryLoading && !primary,
  );

  const hotel = primary ?? fallback ?? null;
  const loading = primaryLoading || (!primary && fallbackLoading);
  const { data: tripStatus } = useEntityTripStatus('hotel', hotel?.id);

  useEffect(() => {
    if (primaryError) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.hotelDetail.loadFailed', 'Failed to load hotel details.'),
        variant: 'destructive',
      });
    }
  }, [primaryError, toast, t]);

  if (!loading && !hotel && !primaryError) {
    return (
      <div className="container mx-auto py-16 text-center">
        <h5 className="text-xl font-semibold mb-4">Hotel not found</h5>
        <Button asChild variant="outline">
          <LocalizedLink to="/hotels">Back to Hotels</LocalizedLink>
        </Button>
      </div>
    );
  }

  const cityName = hotel?.cities?.name || hotel?.city || '';
  const countryName = hotel?.countries?.name || hotel?.country || '';

  const tabs: EntityDetailTab[] = hotel
    ? [
        { id: 'overview', label: t('pages.hotelDetail.overview', 'Overview'), content: <HotelOverview hotel={hotel} t={t} /> },
        ...(hotel.images && hotel.images.length > 1
          ? [{ id: 'photos', label: `Photos (${hotel.images.length})`, content: <HotelPhotos hotel={hotel} /> }]
          : []),
      ]
    : [];

  const breadcrumbs = hotel
    ? [
        { label: t('pages.hotelDetail.backToHotels', 'Hotels'), href: '/hotels' },
        ...(countryName ? [{ label: countryName }] : []),
        ...(cityName ? [{ label: cityName }] : []),
        { label: hotel.name },
      ]
    : undefined;

  return (
    <>
      <EntityDetailLayout
        loading={loading}
        error={(primaryError as Error | null) ?? null}
        hero={
          hotel ? (
            <HotelHero
              hotel={hotel}
              cityName={cityName}
              countryName={countryName}
              tripCount={tripStatus?.count}
              isInTrip={tripStatus?.isInTrip}
              onAddToTrip={() => setAddToTripOpen(true)}
            />
          ) : null
        }
        tabs={tabs}
        sidebar={hotel ? <HotelSidebar hotel={hotel} t={t} /> : undefined}
        breadcrumbs={breadcrumbs}
        entityType="hotel"
        entityId={hotel?.id}
      />
      {hotel && (
        <AddToTripDialog
          open={addToTripOpen}
          onClose={() => setAddToTripOpen(false)}
          entity={{
            type: 'hotel',
            id: hotel.id,
            name: hotel.name,
            latitude: hotel.latitude,
            longitude: hotel.longitude,
            city_id: hotel.city_id,
            country_id: hotel.country_id,
            address: hotel.address,
            category: hotel.hotel_type,
          }}
        />
      )}
    </>
  );
}
