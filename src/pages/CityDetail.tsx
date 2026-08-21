import { useState, useEffect, useMemo, useRef } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTrackView } from '@/hooks/useTrackView';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { MarketplaceForCity } from '@/components/marketplace/MarketplaceForCity';
import { CityLocalSupporterCaption } from '@/components/marketplace/CityLocalSupporterCaption';
import { GuidesRail } from '@/components/guides/GuidesRail';
import { PeopleHereRail } from '@/components/people/PeopleHereRail';
import { SimilarCities } from '@/components/personalization/SimilarCities';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import { TripCoveringBanner } from '@/components/trips/TripCoveringBanner';
import { PlanTripFromHereButton } from '@/components/trips/PlanTripFromHereButton';
import { SinglePage, StickyRailGroup } from '@/components/transit/SinglePage';
import { ProvenanceLine } from '@/components/transit/ProvenanceLine';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { SeeAllLink } from '@/components/ui/SectionHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { GeoCensus } from '@/components/geo/GeoCensus';
import { GeoPhotoInset } from '@/components/geo/GeoPhotoInset';
import { GeoSafetyBanner, GeoSafetyVerdict } from '@/components/geo/GeoSafetyBlock';
import { GeoSectionList, GeoRouteRail } from '@/components/geo/GeoSections';
import {
  geoSections,
  useGeoActiveSection,
  type GeoSection,
} from '@/components/geo/geoSectionModel';
import { PersonalitiesForEntity } from '@/components/discovery/PersonalitiesForEntity';
import { NearbyTriptych } from '@/components/discovery/NearbyTriptych';
import { CityLandmarksRail } from '@/components/geo/CityLandmarksRail';
import { CityActions } from './city-detail/CityActions';
import { CityAtAGlance } from './city-detail/CityAtAGlance';
import { CityOverviewTab } from './city-detail/CityOverviewTab';
import { CityRightsTab } from './city-detail/CityRightsTab';
import { CityVenuesTab, CityDistricts, CityEventsTab } from './city-detail/CityVenuesTab.parts';
import { CityTravelTab } from './city-detail/CityTravelTab';
import { CityNewsTab } from './city-detail/CityNewsTab';
import { CityMapTab } from './city-detail/CityMapTab';

const OUTLINE_ON_INK =
  'border inline-flex items-center gap-2 border-background px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground';

export default function CityDetail() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const { toggleFavorite, isFavorited } = useFavorites('city');
  const { fetchCityImage } = useCityImages();
  const { articles, fetchArticles } = useNews();
  const { city, loading, refetch: refetchCity } = useOptimizedCity(slug ?? '');
  useTrackView({
    type: 'city',
    slug: city?.slug,
    title: city?.name,
    image: resolveEntityImage('city', city).url ?? undefined,
    country: city?.countries?.name,
  });
  // Sync fast path mirroring fetchCityImage's short-circuit (curated wins,
  // then unflagged image_url) so the photo inset exists in the FIRST render for
  // every backfilled city instead of waiting on a JS round-trip. The async
  // edge/Pexels path below only runs on a true miss.
  const syncImageUrl = city
    ? city.curated_image_url || (!city.image_flagged && city.image_url) || ''
    : '';
  const [fetchedImageUrl, setFetchedImageUrl] = useState<string>('');
  const imageUrl = syncImageUrl || fetchedImageUrl;
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

  // Placeholder ("tmp-") cities are auto-created ingest stubs, excluded from maps,
  // listings, and search. Keep the page reachable (e.g. personality-birthplace links)
  // but mark it noindex so it never enters search results.
  const isPlaceholderCity =
    !!city && (city.slug?.startsWith('tmp-') || city.seo_indexable === false);
  useEffect(() => {
    if (!isPlaceholderCity) return;
    let el = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const hadTag = !!el;
    const prev = el?.getAttribute('content') ?? null;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    el.setAttribute('content', 'noindex,nofollow');
    return () => {
      if (!hadTag) document.querySelector('meta[name="robots"]')?.remove();
      else if (prev !== null) el?.setAttribute('content', prev);
    };
  }, [isPlaceholderCity]);

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
  const { events, fetchEvents } = useEvents(false);
  const fetchVenuesRef = useRef(fetchVenues);
  // eslint-disable-next-line react-hooks/refs -- "latest value" ref pattern; effect below reads .current.
  fetchVenuesRef.current = fetchVenues;

  useEffect(() => {
    fetchVenuesRef.current({ cityId: city?.id, city: city?.name, limit: 12, railQuality: true });
  }, [city?.id, city?.name]);

  useEffect(() => {
    fetchEvents({ city: city?.name, limit: 12 });
  }, [city?.name, fetchEvents]);

  const { country: fullCountry, loading: countryLoading } = useOptimizedCountry(
    // Fall back to the raw FK so rights still resolve when the embed is absent.
    city?.countries?.slug || city?.countries?.id || city?.country_id || '',
  );
  const { villages, loading: villagesLoading, fetchVillages } = useQueerVillages(false);

  useEffect(() => {
    if (!city) return;
    // Only hit the network for the photo on a true miss — the sync fast path
    // above already covers curated/unflagged images.
    if (!syncImageUrl) {
      (async () => {
        try {
          const result = await fetchCityImage(city.id, city.name, city.countries?.name || '', {
            existing: {
              image_url: city.image_url,
              curated_image_url: city.curated_image_url,
              image_flagged: city.image_flagged,
            },
          });
          if (result?.image_url) {
            setFetchedImageUrl(result.image_url);
            return;
          }
          // Miss: prefer a real gallery photo over the abstract texture fallback
          const { data } = await supabase.functions.invoke('get-pexels-images', {
            body: { query: city.name, type: 'city' },
          });
          const first = data?.images?.[0];
          setFetchedImageUrl(first?.url || first?.thumbnail || '');
        } catch {
          // Image loading failure is non-critical, fallback to no image
        }
      })();
    }
    fetchArticles({
      cityIds: [city.id],
      countryIds: city.countries?.id ? [city.countries.id] : undefined,
    });
  }, [city, syncImageUrl, fetchCityImage, fetchArticles]);

  useEffect(() => {
    if (city?.id) fetchVillages({ cityId: city.id });
  }, [city?.id, fetchVillages]);

  const breadcrumbs = useMemo(
    () =>
      city
        ? [
            { label: t('breadcrumb.places', 'Places'), href: '/places' },
            ...(city.countries
              ? [
                  {
                    label: city.countries.name,
                    href: `/country/${city.countries.slug || city.countries.id}`,
                  },
                ]
              : []),
            { label: city.name },
          ]
        : null,
    [city, t],
  );
  useBreadcrumbs(breadcrumbs);

  const seeAll = (href: string) => (
    <SeeAllLink to={href} label={t('cities.detail.seeAll', 'See all')} />
  );

  // Spec module order for `city`: 01 fact strip, 03 occurrences, 05 stop list,
  // 15 stat line, 16 map inset (the OWNER module). Sections are built
  // unconditionally so the route rail's stations and the rendered list come
  // from one array, and so the hook below never sits behind an early return.
  const sections: GeoSection[] = city
    ? geoSections([
        {
          id: 'rights',
          title: t('cities.detail.section.rights', 'Safety & rights'),
          note: t('cities.detail.section.rightsNote', 'Know before you go.'),
          content: (
            <CityRightsTab city={city} fullCountry={fullCountry} countryLoading={countryLoading} />
          ),
        },
        {
          id: 'venues',
          title: t('cities.detail.section.venues', 'Where to go'),
          content: venuesLoading ? (
            <TrackLoader label={t('cities.detail.loadingVenues', 'Loading venues')} />
          ) : venues.length > 0 ? (
            <>
              <CityVenuesTab venues={venues} />
              <div className="mt-6">{seeAll(`/venues?city=${encodeURIComponent(city.name)}`)}</div>
            </>
          ) : null,
        },
        {
          id: 'districts',
          title: t('cities.detail.section.districts', 'Queer districts'),
          note: t(
            'cities.detail.section.districtsNote',
            'Walkable clusters of bars, cafés and community spaces.',
          ),
          content:
            !villagesLoading && villages.length > 0 ? <CityDistricts villages={villages} /> : null,
        },
        {
          id: 'events',
          title: t('cities.detail.section.events', 'Next departures'),
          content:
            events.length > 0 ? (
              <>
                <CityEventsTab
                  events={events}
                  locale={i18n.language}
                  openLabel={t('cities.detail.openEvent', 'Open')}
                />
                <div className="mt-6">
                  {seeAll(`/events?city=${encodeURIComponent(city.name)}`)}
                </div>
              </>
            ) : null,
        },
        {
          id: 'overview',
          title: t('cities.detail.section.overview', 'About {{city}}', { city: city.name }),
          // `showDescription` only when the masthead lead used the editorial
          // hook. Without a hook (96.5% of live cities) the lead IS the
          // description, and rendering it again here printed the same
          // paragraph twice on essentially every city page.
          content: <CityOverviewTab city={city} showDescription={!!city.editorial_hook} />,
        },
        {
          id: 'travel',
          title: t('cities.detail.section.travel', 'Getting there'),
          content: (
            <CityTravelTab
              city={city}
              effectiveIata={effectiveIata}
              hasAirport={hasAirport}
              nearestAirport={nearestAirport}
            />
          ),
        },
        {
          id: 'news',
          title: t('cities.detail.section.news', 'In the news'),
          content: articles.length > 0 ? <CityNewsTab articles={articles} /> : null,
        },
      ])
    : [];

  const { activeId, select } = useGeoActiveSection(sections);

  const handleFavoriteToggle = async () => {
    if (!city) return;
    const wasFavorited = isFavorited(city.id);
    try {
      await toggleFavorite(city.id);
      toast({
        title: wasFavorited
          ? t('favorites.removedTitle', 'Removed from favorites')
          : t('favorites.addedTitle', 'Added to favorites'),
        description: wasFavorited
          ? t('favorites.removedDescription', '{{name}} removed from your favorites', {
              name: city.name,
            })
          : t('favorites.addedDescription', '{{name}} added to your favorites', {
              name: city.name,
            }),
      });
    } catch {
      toast({
        title: t('common.error', 'Error'),
        description: t('favorites.updateFailed', 'Failed to update favorites'),
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <TrackLoader label={t('city.loadingDetails', 'Loading city details')} />
      </PageContainer>
    );
  }

  if (!city) {
    return (
      <PageContainer>
        <h1 className="font-display text-display leading-none">
          {t('city.notFoundTitle', 'City not found')}
        </h1>
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          {t('city.notFoundDescription', "The city you're looking for doesn't exist.")}
        </p>
        <LocalizedLink
          to="/places"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          {t('city.backToPlaces', 'All places')}
        </LocalizedLink>
      </PageContainer>
    );
  }

  const planGeo = city.countries?.id
    ? {
        cityId: city.id,
        cityName: city.name,
        countryId: city.countries.id,
        countryName: city.countries.name ?? '',
        countryCode: city.countries.code ?? null,
        timezone: city.timezone ?? null,
      }
    : null;

  // Rendered unconditionally, zeros included — a masthead row that appears and
  // disappears shifts the page under the reader (the /marketplace lesson).
  const census = [
    t('cities.detail.census.stops', '{{n}} stops', { n: venues.length }),
    t('cities.detail.census.districts', '{{n}} districts', { n: villages.length }),
    t('cities.detail.census.departures', '{{n}} departures', { n: events.length }),
  ];

  const eyebrowParts = [t('cities.detail.eyebrow', 'City')];
  if (city.countries?.name) eyebrowParts.push(city.countries.name);

  return (
    <>
      <SinglePage
        type="city"
        eyebrow={eyebrowParts.join(' · ')}
        title={city.name}
        lead={city.editorial_hook || city.description}
        tags={<GeoCensus type="city" items={census} />}
        action={
          <>
            <PlanTripFromHereButton
              initialGeo={planGeo}
              label={t('cities.detail.planTrip', 'Plan a trip to {{city}}', { city: city.name })}
            />
            {user && (
              <button
                type="button"
                onClick={() => setCreateTripOpen(true)}
                className="px-4 py-2 text-13 font-bold transition-colors hover:bg-foreground hover:text-background"
              >
                {t('cities.detail.createTrip', 'Create trip')}
              </button>
            )}
            {/* Save lives with the other actions. It used to be the last
                element of the page, below ten footer rails — a core action a
                reader had to scroll the entire single to find. */}
            <button
              type="button"
              onClick={handleFavoriteToggle}
              className="px-4 py-2 text-13 font-bold transition-colors hover:bg-foreground hover:text-background"
            >
              {isFavorited(city.id)
                ? t('cities.detail.favorited', 'Saved to favorites')
                : t('cities.detail.favorite', 'Save to favorites')}
            </button>
            <CityActions city={city} refetchCity={refetchCity} t={t} />
          </>
        }
        body={
          <>
            {/* Safety first, full width, above everything. */}
            <GeoSafetyBanner
              criminalization={
                city.countries?.lgbti_criminalization as Record<string, unknown> | null | undefined
              }
              countryName={city.countries?.name}
              cityId={city.id}
            />
            <TripCoveringBanner
              target={{ type: 'city', cityId: city.id, countryId: city.countries?.id ?? null }}
            />
            {/* Spec module 01 is slot HEAD, not rail: `FactGrid` is a
              1/2/3-column grid keyed to the VIEWPORT, so in the 360px rail its
              cells collapse to ~110px on a desktop. Same for
              `CountryPracticalInfo`. The rail carries the rail-slot module —
              map inset (16).

              Facts and photo share one band from lg. Stacked full-width they
              cost a whole desktop viewport before the first section heading;
              side by side the head halves and "Safety & rights" arrives a
              scroll earlier. The head strip carries five short facts, so its
              cells survive the narrower column; on mobile the band stacks in
              the same order as before. */}
            {/* The two-up split is gated on the photo actually existing —
                `PhotoInset` self-hides on a miss (~6% of cities), and a grid
                with a dead right column would pin the facts to half width for
                nothing. */}
            <div
              className={
                imageUrl
                  ? 'grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start'
                  : 'contents'
              }
            >
              <CityAtAGlance city={city} hasAirport={hasAirport} effectiveIata={effectiveIata} />
              <GeoPhotoInset
                src={imageUrl}
                alt={city.name}
                fallbackKey={city.id}
                priority
                caption={city.countries?.name ?? null}
              />
            </div>
            <GeoRouteRail
              sections={sections}
              activeId={activeId}
              onNavigate={select}
              orientation="horizontal"
              track="green"
              label={t('cities.detail.sections', 'Sections')}
              className="lg:hidden"
            />
            <GeoSectionList sections={sections} />
          </>
        }
        rail={
          <>
            <GeoSafetyVerdict
              countryId={city.countries?.id}
              equalityScore={city.countries?.equality_score}
            />
            <CityMapTab
              city={city}
              venues={venues}
              caption={city.region_name ?? undefined}
              openLabel={t('cities.detail.openMap', 'Open the full map')}
            />
            {/* Module 15 (stat line) is carried by the masthead census, not by
                a second box here. The rail used to repeat the census's exact
                three numbers ("N stops · N districts · N departures") as a
                labelled list one viewport below it — and module 15's own rule
                is that a count belongs only where it changes what the reader
                does. A duplicate changes nothing; the census is the one
                unconditional render. */}
            <StickyRailGroup>
              {/* Sticky from lg so the line map follows the reader — the
                  horizontal strip already does exactly this on mobile, pinned
                  under the header; without this the desktop TOC scrolls away
                  after the first section. Provenance rides inside the same
                  wrapper: a sibling below a stuck element gets overlapped, not
                  pushed. */}
              <GeoRouteRail
                sections={sections}
                activeId={activeId}
                onNavigate={select}
                orientation="vertical"
                track="green"
                label={t('cities.detail.sections', 'Sections')}
                className="hidden lg:block"
              />
              <ProvenanceLine
                addedAt={city.created_at}
                checkedAt={city.last_verified_at ?? null}
                correctHref="/contact"
              />
            </StickyRailGroup>
          </>
        }
        footer={
          <div className="flex flex-col gap-10">
            {/* Rails live here, not in `sections`: each self-hides from inside
                its own body, which the section filter cannot see, so a station
                would point at nothing.

                Curated down from ten stacked rails to seven, in a fixed
                narrative order — in this city (landmarks, people from here,
                guides, shops), then the community, then onward travel. Two
                rails were cut as duplicates, not casualties: `TrendingStrip`
                re-surfaces the same venues and events the body sections just
                showed, and `SimilarItems` filtered to cities answered the
                question `SimilarCities` already answers with equality-aware
                ranking. One question, one module. */}
            <CityLandmarksRail cityId={city.id} />
            <PersonalitiesForEntity
              cityId={city.id}
              countryId={city.countries?.id ?? null}
              cityName={city.name}
            />
            <GuidesRail filters={{ cityId: city.id }} />
            <MarketplaceForCity cityName={city.name} cityId={city.id} />
            <CityLocalSupporterCaption cityId={city.id} />
            <PeopleHereRail
              mode="locals"
              cityId={city.id}
              title={t('city.localsToMeet', {
                defaultValue: 'Locals and travellers to meet in {{city}}',
                city: city.name,
              })}
              seeAllHref="/community/members"
            />
            <NearbyTriptych
              cityId={city.id}
              latitude={city.latitude != null ? Number(city.latitude) : null}
              longitude={city.longitude != null ? Number(city.longitude) : null}
              countryId={city.countries?.id ?? null}
              countryName={city.countries?.name ?? null}
              equalityScore={city.countries?.equality_score ?? null}
            />
            <SimilarCities
              cityId={city.id}
              cityName={city.name}
              countryId={city.country_id}
              equalityScore={city.countries?.equality_score}
              latitude={city.latitude}
            />
            <section
              aria-labelledby="city-end-of-line"
              className="bg-foreground p-6 text-background md:p-8"
            >
              <p className="text-2xs font-bold uppercase tracking-label text-background/70">
                {t('cities.detail.endOfLine.eyebrow', 'End of line')}
              </p>
              <h2 id="city-end-of-line" className="mt-1 font-display text-headline leading-tight">
                {t('cities.detail.endOfLine.title', 'Riding on?')}
              </h2>
              <p className="mt-2 max-w-reading text-13 leading-relaxed text-background/80">
                {t(
                  'cities.detail.endOfLine.body',
                  'Every city on the guide carries the same modules: safety and rights first, then the places.',
                )}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <LocalizedLink to="/cities" className={OUTLINE_ON_INK}>
                  {t('cities.detail.endOfLine.allCities', 'All cities')}
                </LocalizedLink>
                {city.countries && (
                  <LocalizedLink
                    to={`/country/${city.countries.slug || city.countries.id}`}
                    className={OUTLINE_ON_INK}
                  >
                    {t('cities.detail.endOfLine.country', 'More in {{country}}', {
                      country: city.countries.name,
                    })}
                  </LocalizedLink>
                )}
              </div>
            </section>
          </div>
        }
      />
      <CreateTripDialog open={createTripOpen} onClose={() => setCreateTripOpen(false)} />
    </>
  );
}
