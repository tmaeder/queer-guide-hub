import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { PersonalitiesForEntity } from '@/components/discovery/PersonalitiesForEntity';
import { MoreLikeThisByTag } from '@/components/tags/MoreLikeThisByTag';
import { MarketplaceForVillage } from '@/components/marketplace/MarketplaceForVillage';
import { MarkVisitedButton } from '@/components/marks/MarkVisitedButton';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useEntityDetail } from '@/hooks/useEntityDetail';
import { useSlugRedirect } from '@/hooks/useSlugRedirect';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { SinglePage } from '@/components/transit/SinglePage';
import { FactGrid, type Fact } from '@/components/transit/FactGrid';
import { ProvenanceLine } from '@/components/transit/ProvenanceLine';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { PageContainer } from '@/components/layout/PageContainer';
import { GeoCensus } from '@/components/geo/GeoCensus';
import { GeoSafetyBanner, GeoSafetyVerdict } from '@/components/geo/GeoSafetyBlock';
import { GeoSectionList, GeoRouteRail } from '@/components/geo/GeoSections';
import {
  geoSections,
  useGeoActiveSection,
  type GeoSection,
} from '@/components/geo/geoSectionModel';
import { TripCoveringBanner } from '@/components/trips/TripCoveringBanner';
import { PlanTripFromHereButton } from '@/components/trips/PlanTripFromHereButton';
import {
  type VillageWithRelations,
  buildVillageBreadcrumbs,
  VillageActions,
  VillageTags,
  VillageAbout,
  VillageStops,
  VillageOccurrences,
  VillageParentCity,
  VillagePhotos,
  VillageMapInset,
} from './QueerVillageDetail.parts';

// `equality_score` + `lgbti_criminalization` are new here: the village page had
// no safety layer at all, which meant a district in a criminalising country
// rendered exactly like one in Berlin.
const JOIN_SPEC =
  '*, cities:city_id(id, slug, name), countries:country_id(id, slug, name, code, flag_emoji, equality_score, lgbti_criminalization)';

const OUTLINE_ON_INK =
  'inline-flex items-center gap-2 border-2 border-background px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground';

export default function QueerVillageDetail() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const navigate = useLocalizedNavigate();
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

  // Merged-duplicate slug redirect (village_slug_redirects); client-side
  // fallback for in-app navigation — the edge middleware handles the 301.
  const redirectVillageSlug = useSlugRedirect(
    {
      redirectTable: 'village_slug_redirects',
      redirectIdColumn: 'village_id',
      entityTable: 'queer_villages',
    },
    !isLoading && !village ? (slug ?? null) : null,
  );
  useEffect(() => {
    if (redirectVillageSlug) navigate(`/villages/${redirectVillageSlug}`, { replace: true });
  }, [redirectVillageSlug, navigate]);

  const villageId = village?.id;
  const { venues, loading: venuesLoading, fetchVenues } = useVenues(false);
  const { events, fetchEvents } = useEvents(false, { skipDatasetTotal: true });
  const fetchVenuesRef = useRef(fetchVenues);
  // eslint-disable-next-line react-hooks/refs -- "latest value" ref pattern: keeps the freshest fetchVenues closure available to the village-change effect below without re-running on every fetchVenues identity change.
  fetchVenuesRef.current = fetchVenues;
  const fetchEventsRef = useRef(fetchEvents);
  // eslint-disable-next-line react-hooks/refs -- same pattern; the events effect keys off the venue id list, not the fetcher identity.
  fetchEventsRef.current = fetchEvents;

  // Filter by the VILLAGE, not by its city. This previously asked for 8 venues
  // from anywhere in the parent city, so /villages/chueca listed an Apple Store
  // and a venue 3.7 km away while all 192 venues actually linked to Chueca were
  // never shown. The stop list made it visible by printing the distance between
  // consecutive stops; the old card grid concealed it.
  useEffect(() => {
    if (!villageId) return;
    fetchVenuesRef.current({ queerVillageId: villageId, limit: 24, railQuality: true });
  }, [villageId]);

  const venueIdKey = venues.map((v) => v.id).join(',');
  // Events are scoped THROUGH the venues, for the same reason. `events` carries
  // no village FK, so "events in this district" can only mean "events at the
  // venues in this district"; the old query asked the parent city and
  // advertised everything in Madrid as if it were on the Chueca strip.
  useEffect(() => {
    if (!venueIdKey) return;
    fetchEventsRef.current({ venueIds: venueIdKey.split(','), limit: 12 });
  }, [venueIdKey]);

  useEffect(() => {
    if (error) {
      console.error('Error fetching village:', error);
      toast({
        title: t('village.toast.errorTitle', 'Error'),
        description: t('village.toast.loadFailed', 'Failed to load village details'),
        variant: 'destructive',
      });
    }
  }, [error, toast, t]);

  const breadcrumbs = useMemo(
    () => (village ? buildVillageBreadcrumbs(village, t) : null),
    [village, t],
  );
  useBreadcrumbs(breadcrumbs);

  const cityName = village?.cities?.name ?? null;
  const countryName = village?.countries?.name ?? null;

  // Spec module order for `queer_village`: 01 fact strip, 03 occurrences,
  // 05 stop list (the owner), 08 nested entity, 16 map inset.
  //
  // Module 04 (access panel) is REQUIRED on this type and is deliberately not
  // rendered: villages carry no access column, and folding the linked venues'
  // `accessibility_attributes` into a district-wide yes/partial/no would be a
  // fabricated access claim. The amenity engine review-gates accessibility for
  // exactly this reason — a wrong access claim is real-world harm. Rule 2 says
  // a module with no data does not render, so it does not.
  //
  // Built unconditionally (empty while loading) so the section list and the
  // active-section hook below stay above the early returns — the route rail's
  // stations and the rendered sections must come from the same array.
  const sections: GeoSection[] = village
    ? geoSections([
        {
          id: 'about',
          title: t('village.section.about', 'About {{name}}', { name: village.name }),
          content:
            village.image_url || village.history || village.notable_landmarks?.length ? (
              <VillageAbout village={village} onContentUpdated={refetch} t={t} />
            ) : null,
        },
        {
          id: 'walk',
          title: t('village.section.walk', 'The walk'),
          note: t(
            'village.section.walkNote',
            'Stops in order, with the straight-line gap between them.',
          ),
          content: venuesLoading ? (
            <TrackLoader label={t('village.loadingVenues', 'Loading the stop list')} />
          ) : venues.length > 0 ? (
            <VillageStops venues={venues} />
          ) : null,
        },
        {
          id: 'events',
          title: t('village.section.events', 'Next departures'),
          content:
            events.length > 0 ? (
              <VillageOccurrences
                events={events}
                venues={venues}
                locale={i18n.language}
                openLabel={t('village.events.open', 'Open')}
              />
            ) : null,
        },
        {
          id: 'photos',
          title: t('village.section.photos', 'Photos'),
          content: village.images?.length ? <VillagePhotos village={village} t={t} /> : null,
        },
        {
          id: 'city',
          title: t('village.section.city', 'On the same line'),
          content: village.cities ? <VillageParentCity village={village} t={t} /> : null,
        },
      ])
    : [];

  const { activeId, select } = useGeoActiveSection(sections);

  const handleFavoriteToggle = async () => {
    if (!village) return;
    const wasFavorited = isFavorited(village.id);
    try {
      await toggleFavorite(village.id);
      toast({
        title: wasFavorited
          ? t('favorites.removedTitle', 'Removed from favorites')
          : t('favorites.addedTitle', 'Added to favorites'),
        description: village.name,
      });
    } catch {
      toast({
        title: t('village.toast.errorTitle', 'Error'),
        description: t('favorites.updateFailed', 'Failed to update favorites'),
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <TrackLoader label={t('village.loading', 'Loading this district')} />
      </PageContainer>
    );
  }

  if (!village) {
    return (
      <PageContainer>
        <h1 className="font-display text-display leading-none">
          {t('village.notFound.title', 'No such district.')}
        </h1>
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          {t('village.notFound.body', 'This stop is not on the line.')}
        </p>
        <LocalizedLink
          to="/villages"
          className="mt-6 inline-flex items-center gap-2 border-2 border-foreground px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          {t('village.notFound.cta', 'All queer villages')}
        </LocalizedLink>
      </PageContainer>
    );
  }

  const facts: Fact[] = [
    { label: t('village.facts.city', 'City'), value: cityName },
    {
      label: t('village.facts.country', 'Country'),
      value: countryName ? `${village.countries?.flag_emoji ?? ''} ${countryName}`.trim() : null,
    },
    { label: t('village.facts.venues', 'Venues'), value: venues.length || null },
    { label: t('village.facts.events', 'Upcoming events'), value: events.length || null },
  ];

  const planGeo =
    village.cities?.id && village.countries?.id
      ? {
          cityId: village.cities.id,
          cityName: village.cities.name ?? '',
          countryId: village.countries.id,
          countryName: village.countries.name ?? '',
          countryCode: village.countries.code ?? null,
          timezone: null,
        }
      : null;

  // Rendered unconditionally, zeros included — see GeoCensus. A row that
  // appears and disappears shifts the masthead under the reader.
  const census = [
    t('village.census.stops', '{{n}} stops', { n: venues.length }),
    t('village.census.departures', '{{n}} departures', { n: events.length }),
  ];
  if (cityName) census.push(cityName);

  return (
    <SinglePage
      type="queer_village"
      eyebrow={t('village.eyebrow', 'District · Green line')}
      title={village.name}
      status={village.featured ? t('village.facts.editorsPick', 'Editor’s pick') : undefined}
      lead={village.description}
      tags={
        <div className="flex flex-col gap-4">
          <GeoCensus type="queer_village" items={census} />
          <VillageTags village={village} />
        </div>
      }
      action={
        <>
          <PlanTripFromHereButton
            initialGeo={planGeo}
            label={t('village.planTrip', 'Plan a trip to {{name}}', { name: village.name })}
          />
          <MarkVisitedButton entityType="village" entityId={village.id} kind="visited" />
          <MarkVisitedButton entityType="village" entityId={village.id} kind="saved" />
          <VillageActions village={village} onContentUpdated={refetch} t={t} />
        </>
      }
      body={
        <>
          {/* Safety first, full width, above everything. A criminalisation
              warning in a 360px rail is a warning the reader scrolls past. */}
          <GeoSafetyBanner
            criminalization={village.countries?.lgbti_criminalization}
            countryName={countryName}
            cityId={village.cities?.id}
          />
          <TripCoveringBanner
            target={{
              type: 'village',
              villageId: village.id,
              parentCityId: village.cities?.id ?? null,
              countryId: village.countries?.id ?? null,
            }}
          />
          {/* Spec module 01 is slot HEAD, not rail: `FactGrid` is a
              1/2/3-column grid keyed to the VIEWPORT, so in the 360px rail its
              cells collapse to ~110px on a desktop. Same for
              `CountryPracticalInfo`. The rail carries the rail-slot modules —
              map inset (16) and stat line (15). */}
          <FactGrid facts={facts} />
          <GeoRouteRail
            sections={sections}
            activeId={activeId}
            onNavigate={select}
            orientation="horizontal"
            track="green"
            label={t('village.sections', 'Sections')}
            className="lg:hidden"
          />
          <GeoSectionList sections={sections} />
        </>
      }
      rail={
        <>
          <GeoSafetyVerdict
            countryId={village.countries?.id}
            equalityScore={village.countries?.equality_score}
            rightsHref={
              village.countries?.slug ? `/country/${village.countries.slug}#rights` : null
            }
          />
          <VillageMapInset
            village={village}
            venues={venues}
            caption={
              cityName
                ? t('village.map.caption', 'Walking distance in {{city}}.', { city: cityName })
                : undefined
            }
          />
          <GeoRouteRail
            sections={sections}
            activeId={activeId}
            onNavigate={select}
            orientation="vertical"
            track="green"
            label={t('village.sections', 'Sections')}
            className="hidden lg:block"
          />
          <ProvenanceLine
            addedAt={village.created_at}
            checkedAt={village.last_verified_at ?? null}
            correctHref="/contact"
          />
        </>
      }
      footer={
        <div className="flex flex-col gap-12">
          {/* Rails live in the footer, not in `sections`: each self-hides when
              empty from inside its own body, which the section filter cannot
              see, so a station would point at nothing. */}
          <PersonalitiesForEntity
            cityId={village.cities?.id ?? null}
            countryId={village.countries?.id ?? null}
            cityName={cityName ?? village.name}
          />
          <MarketplaceForVillage parentCityName={cityName} />
          <SimilarItems entity={{ type: 'queer_village', id: village.id }} />
          <MoreLikeThisByTag
            entityType="queer_village"
            entityId={village.id}
            title={t('village.relatedByTag', 'Related by tag')}
          />
          <section
            aria-labelledby="village-end-of-line"
            className="border-[3px] border-foreground bg-foreground p-6 text-background md:p-8"
          >
            <p className="text-2xs font-bold uppercase tracking-label text-background/70">
              {t('village.endOfLine.eyebrow', 'End of line')}
            </p>
            <h2 id="village-end-of-line" className="mt-1 font-display text-headline leading-tight">
              {t('village.endOfLine.title', 'Looking for another district?')}
            </h2>
            <p className="mt-2 max-w-reading text-13 leading-relaxed text-background/80">
              {t(
                'village.endOfLine.body',
                'Queer villages are walkable clusters of bars, cafés and community spaces. There are more of them.',
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <LocalizedLink to="/villages" className={OUTLINE_ON_INK}>
                {t('village.notFound.cta', 'All queer villages')}
              </LocalizedLink>
              {village.cities && (
                <LocalizedLink
                  to={`/city/${village.cities.slug || village.cities.id}`}
                  className={OUTLINE_ON_INK}
                >
                  {t('village.endOfLine.city', 'More in {{city}}', { city: village.cities.name })}
                </LocalizedLink>
              )}
            </div>
          </section>
          {/* The favourite toggle lives here rather than the masthead: it is a
              personal bookmark, not one of the page's concrete verbs. */}
          <button
            type="button"
            onClick={handleFavoriteToggle}
            className="self-start border-2 border-foreground px-4 py-2 text-13 font-bold transition-colors hover:bg-foreground hover:text-background"
          >
            {isFavorited(village.id)
              ? t('village.action.favorited', 'Saved to favorites')
              : t('village.action.favorite', 'Save to favorites')}
          </button>
        </div>
      }
    />
  );
}
