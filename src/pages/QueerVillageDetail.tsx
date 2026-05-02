import { useEffect, useRef } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useEntityDetail } from '@/hooks/useEntityDetail';
import { EntityDetailLayout } from '@/components/entity/EntityDetailLayout';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  type VillageWithRelations,
  buildVillageBreadcrumbs,
  VillageHero,
  VillageOverviewTab,
  VillageVenuesTab,
  VillageEventsTab,
  VillagePhotosTab,
  VillageMapTab,
  VillageTabLabel,
  villageTabIcons,
} from './QueerVillageDetail.parts';

const JOIN_SPEC =
  '*, cities:city_id(id, slug, name), countries:country_id(id, slug, name, flag_emoji)';

export default function QueerVillageDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const { toggleFavorite, isFavorited } = useFavorites('queer_village');

  const {
    data: village,
    isLoading,
    error,
  } = useEntityDetail<VillageWithRelations>({
    table: 'queer_villages',
    slug,
    joinSpec: JOIN_SPEC,
    queryKey: 'queer-village-detail',
  });

  const cityName = village?.cities?.name;
  const { venues, loading: venuesLoading, fetchVenues } = useVenues(false);
  const { events, loading: eventsLoading, fetchEvents } = useEvents(false);
  const fetchVenuesRef = useRef(fetchVenues);
  fetchVenuesRef.current = fetchVenues;

  useEffect(() => {
    fetchVenuesRef.current({ city: cityName, limit: 8 });
  }, [cityName]);

  useEffect(() => {
    fetchEvents({ city: cityName, limit: 8 });
  }, [cityName, fetchEvents]);

  useEffect(() => {
    if (error) {
      console.error('Error fetching village:', error);
      toast({
        title: 'Error',
        description: 'Failed to load village details',
        variant: 'destructive',
      });
    }
  }, [error, toast]);

  const handleFavoriteToggle = async () => {
    if (!village) return;
    try {
      await toggleFavorite(village.id);
      toast({
        title: isFavorited(village.id) ? 'Removed from favorites' : 'Added to favorites',
        description: `${village.name} ${isFavorited(village.id) ? 'removed from' : 'added to'} your favorites`,
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to update favorites', variant: 'destructive' });
    }
  };

  if (!isLoading && !error && !village) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Box sx={{ mx: 'auto', px: 2, py: 4, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            Village Not Found
          </Typography>
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>
            The queer village you&apos;re looking for doesn&apos;t exist.
          </Typography>
          <LocalizedLink to="/villages" style={{ color: 'inherit', fontWeight: 500 }}>
            ← Back to Villages
          </LocalizedLink>
        </Box>
      </Box>
    );
  }

  const tabs = village
    ? [
        {
          id: 'overview',
          label: <VillageTabLabel icon={villageTabIcons.Landmark} label="Overview" />,
          content: <VillageOverviewTab village={village} />,
        },
        {
          id: 'venues',
          label: <VillageTabLabel icon={villageTabIcons.Building} label="Venues" />,
          content: (
            <VillageVenuesTab village={village} venues={venues} loading={venuesLoading} />
          ),
        },
        {
          id: 'events',
          label: <VillageTabLabel icon={villageTabIcons.Calendar} label="Events" />,
          content: (
            <VillageEventsTab village={village} events={events} loading={eventsLoading} />
          ),
        },
        {
          id: 'photos',
          label: <VillageTabLabel icon={villageTabIcons.ImageIcon} label="Photos" />,
          content: <VillagePhotosTab village={village} />,
        },
        {
          id: 'map',
          label: <VillageTabLabel icon={villageTabIcons.MapPin} label="Map" />,
          content: <VillageMapTab village={village} venues={venues} />,
        },
      ]
    : [];

  return (
    <>
      <EntityDetailLayout
        loading={isLoading}
        error={error as Error | null}
        breadcrumbs={village ? buildVillageBreadcrumbs(village) : undefined}
        hero={
          village ? (
            <VillageHero
              village={village}
              isFavorited={isFavorited(village.id)}
              onFavoriteToggle={handleFavoriteToggle}
            />
          ) : null
        }
        tabs={tabs}
        entityType="queer_village"
        entityId={village?.id}
      />
      {village && (
        <Box sx={{ mx: 'auto', px: 2 }}>
          <SimilarItems entity={{ type: 'queer_village', id: village.id }} className="mt-8" />
        </Box>
      )}
    </>
  );
}
