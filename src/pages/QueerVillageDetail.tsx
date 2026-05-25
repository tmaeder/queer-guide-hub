import { useEffect, useRef } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { MarketplaceForVillage } from '@/components/marketplace/MarketplaceForVillage';
import { MarkVisitedButton } from '@/components/marks/MarkVisitedButton';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useEntityDetail } from '@/hooks/useEntityDetail';
import { EntityDetailLayout } from '@/components/entity/EntityDetailLayout';
import {
  EditorialDetailLayout,
  IntroEssay,
  KeyFactsStrip,
  type KeyFact,
  type SectionDef,
} from '@/components/entity/editorial';
import { EDITORIAL_DETAIL_LAYOUT_ENABLED } from '@/lib/featureFlags';
import { TripCoveringBanner } from '@/components/trips/TripCoveringBanner';
import { PlanTripFromHereButton } from '@/components/trips/PlanTripFromHereButton';
import { VILLAGE_SECTION_DEFS } from './queer-village-detail/VillageSectionDefs';
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
    refetch,
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
      <div className="min-h-screen bg-background">
        <div className="mx-auto px-4 py-8 text-center">
          <h5 className="text-xl font-bold mb-4">Village Not Found</h5>
          <p className="text-muted-foreground mb-6">
            The queer village you&apos;re looking for doesn&apos;t exist.
          </p>
          <LocalizedLink to="/villages" style={{ color: 'inherit' }} className="font-medium">
            ← Back to Villages
          </LocalizedLink>
        </div>
      </div>
    );
  }

  const sectionContent: Record<string, React.ReactNode> = village
    ? {
        overview: <VillageOverviewTab village={village} onContentUpdated={refetch} />,
        venues: <VillageVenuesTab village={village} venues={venues} loading={venuesLoading} />,
        events: <VillageEventsTab village={village} events={events} loading={eventsLoading} />,
        photos: <VillagePhotosTab village={village} />,
        map: <VillageMapTab village={village} venues={venues} />,
      }
    : {};

  const tabs = village
    ? [
        {
          id: 'overview',
          label: <VillageTabLabel icon={villageTabIcons.Landmark} label="Overview" />,
          content: sectionContent.overview,
        },
        {
          id: 'venues',
          label: <VillageTabLabel icon={villageTabIcons.Building} label="Venues" />,
          content: sectionContent.venues,
        },
        {
          id: 'events',
          label: <VillageTabLabel icon={villageTabIcons.Calendar} label="Events" />,
          content: sectionContent.events,
        },
        {
          id: 'photos',
          label: <VillageTabLabel icon={villageTabIcons.ImageIcon} label="Photos" />,
          content: sectionContent.photos,
        },
        {
          id: 'map',
          label: <VillageTabLabel icon={villageTabIcons.MapPin} label="Map" />,
          content: sectionContent.map,
        },
      ]
    : [];

  if (village && EDITORIAL_DETAIL_LAYOUT_ENABLED) {
    const sections: SectionDef[] = VILLAGE_SECTION_DEFS.map((def) => ({
      id: def.id,
      label: def.label,
      content: sectionContent[def.id] ?? null,
    }));

    const tagsValue = Array.isArray(village.tags) && village.tags.length > 0
      ? village.tags.slice(0, 3).join(', ')
      : null;

    const facts: KeyFact[] = [
      { label: 'City', value: village.cities?.name || null },
      {
        label: 'Country',
        value:
          village.countries?.flag_emoji || village.countries?.name
            ? `${village.countries.flag_emoji ?? ''} ${village.countries.name ?? ''}`.trim()
            : null,
      },
      { label: 'Vibe', value: tagsValue },
      { label: 'Venues nearby', value: venues.length || null },
      { label: 'Events', value: events.length || null },
      { label: 'Featured', value: village.is_featured ? 'Editor’s pick' : null },
    ];

    const planGeo = village.cities?.id && village.countries?.id
      ? {
          cityId: village.cities.id,
          cityName: village.cities.name ?? '',
          countryId: village.countries.id,
          countryName: village.countries.name ?? '',
          countryCode: village.countries.code ?? null,
          timezone: null,
        }
      : null;

    return (
      <>
        <EditorialDetailLayout
          loading={isLoading}
          error={error as Error | null}
          breadcrumbs={buildVillageBreadcrumbs(village)}
          banner={
            <TripCoveringBanner
              target={{
                type: 'village',
                villageId: village.id,
                parentCityId: village.cities?.id ?? null,
                countryId: village.countries?.id ?? null,
              }}
            />
          }
          header={
            <div className="flex flex-col gap-8">
              <VillageHero
                village={village}
                isFavorited={isFavorited(village.id)}
                onFavoriteToggle={handleFavoriteToggle}
                onContentUpdated={refetch}
              />
              <div className="flex flex-wrap gap-2">
                <PlanTripFromHereButton
                  initialGeo={planGeo}
                  label={`Plan a trip to ${village.name}`}
                />
              </div>
              <IntroEssay text={village.description} />
              <KeyFactsStrip facts={facts} />
            </div>
          }
          sections={sections}
          footer={
            <div className="px-0">
              <MarketplaceForVillage parentCityName={village.cities?.name ?? null} />
              <div className="mb-6 mt-8 flex flex-wrap gap-2">
                <MarkVisitedButton entityType="village" entityId={village.id} kind="visited" />
                <MarkVisitedButton entityType="village" entityId={village.id} kind="saved" />
              </div>
              <SimilarItems entity={{ type: 'queer_village', id: village.id }} />
            </div>
          }
          entityType="queer_village"
          entityId={village.id}
        />
      </>
    );
  }

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
              onContentUpdated={refetch}
            />
          ) : null
        }
        tabs={tabs}
        entityType="queer_village"
        entityId={village?.id}
      />
      {village && (
        <div className="mx-auto px-4">
          <div className="mt-6 flex flex-wrap gap-2">
            <MarkVisitedButton entityType="village" entityId={village.id} kind="visited" />
            <MarkVisitedButton entityType="village" entityId={village.id} kind="saved" />
          </div>
          <SimilarItems entity={{ type: 'queer_village', id: village.id }} className="mt-8" />
        </div>
      )}
    </>
  );
}
