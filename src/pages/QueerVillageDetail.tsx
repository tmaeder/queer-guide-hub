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
import { mergedVillageCitySlug } from '@/lib/mergedVillageRedirects';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { SinglePage } from '@/components/transit/SinglePage';
import { ProvenanceLine } from '@/components/transit/ProvenanceLine';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { PageContainer } from '@/components/layout/PageContainer';
import { GatedDetailFallback } from '@/components/safety/GatedDetailFallback';
import { GeoSafetyBanner, GeoSafetyVerdict } from '@/components/geo/GeoSafetyBlock';
import { GeoSectionList, GeoRouteRail } from '@/components/geo/GeoSections';
import {
  geoSections,
  useGeoActiveSection,
  type GeoSection,
} from '@/components/geo/geoSectionModel';
import { TripCoveringBanner } from '@/components/trips/TripCoveringBanner';
import { PlanTripFromHereButton } from '@/components/trips/PlanTripFromHereButton';
import { GlossaryLinkedText } from '@/components/tags/GlossaryLinkedText';
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
import { LocationActionMenu, LocationExploreMore } from '@/components/geo/LocationDetail';

// `equality_score` + `lgbti_criminalization` are new here: the village page had
// no safety layer at all, which meant a district in a criminalising country
// rendered exactly like one in Berlin.
const JOIN_SPEC =
  '*, cities:city_id(id, slug, name), countries:country_id(id, slug, name, code, flag_emoji, equality_score, lgbti_criminalization)';

const OUTLINE_ON_INK =
  'inline-flex items-center gap-2 rounded-element bg-background/15 px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground';

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

  // 14 villages were hard-merged into their city and their rows are gone, so
  // village_slug_redirects above cannot resolve them (it cascaded away with the
  // spine row, and it only ever points at another /villages/:slug).
  // public/_redirects 301s the unprefixed paths at the edge; this covers the
  // /:lang/ ones and in-app navigation, which those rules never see.
  const mergedCitySlug = !isLoading && !village ? mergedVillageCitySlug(slug) : null;
  useEffect(() => {
    if (mergedCitySlug) navigate(`/city/${mergedCitySlug}`, { replace: true });
  }, [mergedCitySlug, navigate]);

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
          id: 'walk',
          title: t('village.section.walk', 'The walk'),
          note: t(
            'village.section.walkNote',
            'Stops in order, with the straight-line gap between them.',
          ),
          content: venuesLoading ? (
            <TrackLoader label={t('village.loadingVenues', 'Loading the stop list')} />
          ) : venues.length > 0 ? (
            <>
              <VillageStops venues={venues.slice(0, 8)} />
              {venues.length > 8 && (
                <details className="group mt-4">
                  <summary className="inline-flex cursor-pointer list-none items-center rounded-element px-4 py-2 text-13 font-bold transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    {t('village.walk.showAll', 'Show all {{count}} stops', {
                      count: venues.length,
                    })}
                  </summary>
                  <div className="mt-4">
                    <VillageStops venues={venues.slice(8)} previousVenue={venues[7]} />
                  </div>
                </details>
              )}
            </>
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
          id: 'map',
          title: t('village.section.map', 'Map'),
          presentation: 'disclosure',
          mountWhenOpen: true,
          content:
            typeof village.latitude === 'number' && typeof village.longitude === 'number' ? (
              <VillageMapInset village={village} venues={venues} />
            ) : null,
        },
        {
          id: 'about',
          title: t('village.section.about', 'About {{name}}', { name: village.name }),
          presentation: 'disclosure',
          content:
            village.image_url || village.history || village.notable_landmarks?.length ? (
              <VillageAbout village={village} onContentUpdated={refetch} t={t} />
            ) : null,
        },
        {
          id: 'city',
          title: t('village.section.city', 'On the same line'),
          content: village.cities ? <VillageParentCity village={village} t={t} /> : null,
        },
        {
          id: 'photos',
          title: t('village.section.photos', 'Photos'),
          presentation: 'disclosure',
          content: village.images?.length ? <VillagePhotos village={village} t={t} /> : null,
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
    const villageNotFound = (
      <PageContainer>
        <h1 className="font-display text-display leading-none">
          {t('village.notFound.title', 'No such district.')}
        </h1>
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          {t('village.notFound.body', 'This stop is not on the line.')}
        </p>
        <LocalizedLink
          to="/villages"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          {t('village.notFound.cta', 'All queer villages')}
        </LocalizedLink>
      </PageContainer>
    );
    // Safety layer: a logged-out visitor with a direct link to a gated village
    // gets `null` from RLS — indistinguishable from a genuinely missing one.
    return (
      <GatedDetailFallback entityType="queer_village" slug={slug} notFound={villageNotFound} />
    );
  }

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

  // Rendered unconditionally, zeros included. A row that
  // appears and disappears shifts the masthead under the reader.
  const census = [
    t('village.census.stops', '{{n}} stops', { n: venues.length }),
    t('village.census.departures', '{{n}} departures', { n: events.length }),
  ];
  if (cityName) census.push(cityName);
  if (countryName) census.push(countryName);

  return (
    <SinglePage
      type="queer_village"
      density="compact"
      letter="Q"
      eyebrow={t('village.eyebrow', 'District · Green line')}
      title={village.name}
      status={village.featured ? t('village.facts.editorsPick', 'Editor’s pick') : undefined}
      lead={<GlossaryLinkedText text={village.description} />}
      tags={
        <div className="flex flex-col gap-4">
          <p className="text-13 tabular-nums text-muted-foreground">{census.join(' · ')}</p>
          <VillageTags village={village} />
        </div>
      }
      action={
        <>
          {typeof village.latitude === 'number' && typeof village.longitude === 'number' && (
            <a
              href="#map"
              className="inline-flex min-h-11 items-center rounded-element bg-foreground px-6 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('village.action.openMap', 'Open map')}
            </a>
          )}
          <button
            type="button"
            onClick={handleFavoriteToggle}
            className="rounded-element px-4 py-2 text-13 font-bold transition-colors hover:bg-surface-container active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isFavorited(village.id)
              ? t('village.action.favorited', 'Saved to favorites')
              : t('village.action.favorite', 'Save to favorites')}
          </button>
          <LocationActionMenu label={t('common.moreActions', 'More actions')}>
            <PlanTripFromHereButton
              initialGeo={planGeo}
              label={t('village.planTrip', 'Plan a trip to {{name}}', { name: village.name })}
            />
            <MarkVisitedButton entityType="village" entityId={village.id} kind="visited" />
            <VillageActions village={village} onContentUpdated={refetch} t={t} />
          </LocationActionMenu>
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
          <GeoSafetyVerdict
            countryId={village.countries?.id}
            equalityScore={village.countries?.equality_score}
            rightsHref={
              village.countries?.slug ? `/country/${village.countries.slug}#rights` : null
            }
          />
          <GeoRouteRail
            sections={sections}
            activeId={activeId}
            onNavigate={select}
            orientation="horizontal"
            track="green"
            label={t('village.sections', 'Sections')}
          />
          <GeoSectionList sections={sections} />
        </>
      }
      footer={
        <div className="flex flex-col gap-12">
          {/* Rails live in the footer, not in `sections`: each self-hides when
              empty from inside its own body, which the section filter cannot
              see, so a station would point at nothing. */}
          <LocationExploreMore
            title={t('village.exploreMore', 'Explore beyond {{name}}', { name: village.name })}
            groups={[
              {
                id: 'village-people',
                title: t('village.explorePeople', 'People and local context'),
                summary: t(
                  'village.explorePeopleNote',
                  'People and stories connected to this district.',
                ),
                content: (
                  <div className="flex flex-col gap-8">
                    <PersonalitiesForEntity
                      cityId={village.cities?.id ?? null}
                      countryId={village.countries?.id ?? null}
                      cityName={cityName ?? village.name}
                    />
                    <MoreLikeThisByTag
                      entityType="queer_village"
                      entityId={village.id}
                      title={t('village.relatedByTag', 'Related by tag')}
                    />
                  </div>
                ),
              },
              {
                id: 'village-marketplace',
                title: t('village.exploreMarketplace', 'Local marketplace'),
                summary: t(
                  'village.exploreMarketplaceNote',
                  'Support work connected to the parent city.',
                ),
                content: <MarketplaceForVillage parentCityName={cityName} />,
              },
              {
                id: 'village-related',
                title: t('village.exploreRelated', 'Related districts'),
                summary: t(
                  'village.exploreRelatedNote',
                  'Continue with another queer neighbourhood.',
                ),
                content: <SimilarItems entity={{ type: 'queer_village', id: village.id }} />,
              },
            ]}
          />
          <ProvenanceLine
            addedAt={village.created_at}
            checkedAt={village.last_verified_at ?? null}
            correctHref="/contact"
          />
          <section
            aria-labelledby="village-end-of-line"
            className="overflow-hidden rounded-container bg-foreground p-6 text-background md:p-8"
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
        </div>
      }
    />
  );
}
