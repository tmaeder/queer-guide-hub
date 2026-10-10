import { useEffect, useMemo, useRef, useState } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTrackView } from '@/hooks/useTrackView';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useSlugRedirect } from '@/hooks/useSlugRedirect';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { SinglePage } from '@/components/transit/SinglePage';
import { ProvenanceLine } from '@/components/transit/ProvenanceLine';
import { mapUrl } from '@/lib/mapContext';
import { splitProseParagraphs } from '@/lib/prose';
import { buildLegalLine } from '@/lib/rights/legalLine';
import { SafetyVerdict } from '@/components/country/SafetyVerdict';
import { CountryFactSheet } from '@/components/country/CountryFactSheet';
import { CountryStatsBand } from '@/components/country/CountryStatsBand';
import { CountryMap } from '@/components/geo/CountryMap';
import { hasCountryMap } from '@/components/geo/countryMapIndex';
import { GeoCensus } from '@/components/geo/GeoCensus';
import { GeoSafetyBanner } from '@/components/geo/GeoSafetyBlock';
import { GeoSectionList, GeoRouteRail } from '@/components/geo/GeoSections';
import {
  geoSections,
  useGeoActiveSection,
  type GeoSection,
} from '@/components/geo/geoSectionModel';
import { useWorldBankData } from '@/hooks/useWorldBankData';
import { useSDGData } from '@/hooks/useSDGData';
import { useOptimizedCountry, useOptimizedCities } from '@/hooks/usePlaces';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useNews } from '@/hooks/useNews';
import { useMilestonesForCountry } from '@/hooks/useMilestones';
import { TransSafetyBand } from '@/components/rights/TransSafetyBand';
import { TripCoveringBanner } from '@/components/trips/TripCoveringBanner';
import { PlanTripFromHereButton } from '@/components/trips/PlanTripFromHereButton';
import { PersonalitiesForEntity } from '@/components/discovery/PersonalitiesForEntity';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { hasAnyCriminalizationSignal } from '@/utils/equalityScore';
import { SeeAllLink } from '@/components/ui/SectionHeader';
import {
  CountryRightsTab,
  CountryActions,
  CountryLegalRecord,
  CountryCitiesTab,
  CountryVenuesTab,
  CountryEventsTab,
  CountryTravelTab,
  CountryNewsTab,
  CountryMapTab,
  fetchCountryWeather,
  type WeatherDataType,
} from './CountryDetail.parts';
import { PageContainer } from '@/components/layout/PageContainer';
import { GlossaryLinkedText } from '@/components/tags/GlossaryLinkedText';
import { publishedCountryEditorial } from '@/lib/countryEditorial';
import { useMeta } from '@/hooks/useMeta';
import { LocationActionMenu, LocationExploreMore } from '@/components/geo/LocationDetail';
import { CountryPhotoGallery } from '@/components/country/CountryPhotoGallery';

const FOOTER_LINK =
  'inline-flex min-h-12 items-center gap-2 rounded-element bg-surface-container px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function CountryDetail() {
  const { slug: countrySlug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const { track } = useTrackEvent();
  const navigate = useLocalizedNavigate();

  const { country, loading, refetch: refetchCountry } = useOptimizedCountry(countrySlug ?? '');
  const editorial = useMemo(
    () => (country ? publishedCountryEditorial(country, i18n.resolvedLanguage) : null),
    [country, i18n.resolvedLanguage],
  );

  // Merged-duplicate slug redirect (country_slug_redirects); client-side
  // fallback for in-app navigation — the edge middleware handles the 301.
  const redirectCountrySlug = useSlugRedirect(
    {
      redirectTable: 'country_slug_redirects',
      redirectIdColumn: 'country_id',
      entityTable: 'countries',
    },
    !loading && !country ? (countrySlug ?? null) : null,
  );
  useEffect(() => {
    if (redirectCountrySlug) navigate(`/country/${redirectCountrySlug}`, { replace: true });
  }, [redirectCountrySlug, navigate]);

  useTrackView({
    type: 'country',
    slug: country?.slug,
    title: country?.name,
    image: resolveEntityImage('country', country).url ?? undefined,
    country: country?.name,
  });

  const { cities } = useOptimizedCities({ countryId: country?.id ?? '', limit: 12 });
  const { venues, fetchVenues } = useVenues(false);
  const { events, fetchEvents } = useEvents(false);
  const { articles, fetchArticles, incrementViews } = useNews();

  // Hoisted rather than left inside `CountryLegalRecord`: a component that
  // returns null from its own body is invisible to the section filter, so the
  // route rail would draw a station pointing at an empty heading. The page has
  // to know whether the module has data BEFORE it builds the section.
  //
  // The gate is the STATION count, not the milestone count. A country can have
  // no milestone rows and still have a legal record — its adoption years live
  // on the rights columns, and gating on milestones alone hid the line for
  // every such country.
  const { data: legalRecord } = useMilestonesForCountry(country?.id, 12);
  const legalStations = useMemo(
    () =>
      buildLegalLine({
        country: country as unknown as Record<string, unknown> | null,
        milestones: legalRecord,
      }),
    [country, legalRecord],
  );

  const worldBankData = useWorldBankData(country ?? null);
  const sdgData = useSDGData(country ?? null);

  const [weatherData, setWeatherData] = useState<WeatherDataType>(null);
  const fetchVenuesRef = useRef(fetchVenues);
  // eslint-disable-next-line react-hooks/refs -- "latest value" ref; effect reads .current.
  fetchVenuesRef.current = fetchVenues;

  useEffect(() => {
    if (country?.id) {
      track({
        eventType: 'page_view',
        entityType: 'country',
        entityId: country.id,
        metadata: { name: country.name },
      });
    }
  }, [country?.id, country?.name, track]);

  useEffect(() => {
    if (country?.id)
      fetchVenuesRef.current({ countryId: country.id, limit: 12, railQuality: true });
  }, [country?.id]);

  useEffect(() => {
    if (country?.id) fetchEvents({ countryId: country.id, limit: 12 });
  }, [country?.id, fetchEvents]);

  useEffect(() => {
    if (country?.id) fetchArticles({ countryIds: [country.id] });
  }, [country?.id, fetchArticles]);

  useEffect(() => {
    if (!country) return;
    let cancelled = false;
    fetchCountryWeather(country).then((data) => {
      if (!cancelled && data) setWeatherData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [country]);

  // Placeholder / non-indexable countries stay reachable but never enter search.
  const isNoindex = !!country && country.seo_indexable === false;
  useMeta({
    title: editorial?.name ?? country?.name,
    description: editorial?.description ?? undefined,
    canonicalPath: country?.slug ? `/country/${country.slug}` : undefined,
    ogImage: country ? (resolveEntityImage('country', country).url ?? undefined) : undefined,
    noIndex: isNoindex,
  });

  const hasStats = useMemo(
    () =>
      !!country &&
      (worldBankData?.hasData ||
        sdgData?.hasData ||
        country.gdp_per_capita_usd != null ||
        country.human_development_index != null ||
        country.life_expectancy != null ||
        country.literacy_rate != null),
    [country, worldBankData, sdgData],
  );

  const breadcrumbs = useMemo(
    () =>
      country
        ? [
            { label: t('country.breadcrumb.places', 'Places'), href: '/places' },
            { label: editorial?.name ?? country.name },
          ]
        : null,
    [country, editorial?.name, t],
  );
  useBreadcrumbs(breadcrumbs);

  const seeAll = (href: string) => (
    <SeeAllLink to={href} label={t('cities.detail.seeAll', 'See all')} />
  );

  // Cities and practical travel lead the browsing flow. Safety warnings remain
  // above it; the complete legal record keeps its stable #rights/#history anchors.
  // Sections and route stations share this array, so empty modules disappear together.
  const hasSilhouette = hasCountryMap(country?.code);
  const hasMap =
    hasSilhouette ||
    (typeof country?.latitude === 'number' && typeof country?.longitude === 'number');
  const countryMap =
    country && hasMap ? (
      hasSilhouette ? (
        <div>
          <CountryMap code={country.code} name={country.name} />
          <LocalizedLink
            to={
              typeof country.latitude === 'number' && typeof country.longitude === 'number'
                ? mapUrl({
                    center: [country.longitude, country.latitude],
                    zoom: 4,
                    lines: ['M', 'E'],
                  })
                : '/map'
            }
            className="mt-2 inline-flex min-h-12 items-center rounded-element px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('country.openMap', 'Open the full map')}
          </LocalizedLink>
        </div>
      ) : (
        <CountryMapTab country={country} openLabel={t('country.openMap', 'Open the full map')} />
      )
    ) : null;
  const weatherNow = weatherData?.current?.temperature ?? weatherData?.temperature ?? null;
  const photos = useMemo(() => {
    const candidates = [
      {
        src: resolveEntityImage('country', country).url,
        caption: editorial?.name ?? country?.name ?? '',
      },
      ...cities.map((city) => ({ src: resolveEntityImage('city', city).url, caption: city.name })),
    ];
    const seen = new Set<string>();
    return candidates
      .filter((photo): photo is { src: string; caption: string } => {
        if (!photo.src) return false;
        // The same stored asset can be copied into both country and city buckets.
        const url = new URL(photo.src);
        const key = url.hostname === 'img.queer.guide' ? url.pathname.split('/').pop()! : photo.src;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }, [country, cities, editorial?.name]);

  const sections: GeoSection[] = country
    ? geoSections([
        {
          id: 'cities',
          title: t('country.section.cities', 'Cities'),
          content:
            cities.length > 0 ? (
              <div className={hasMap ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]' : undefined}>
                <div className="min-w-0">
                  <CountryCitiesTab cities={cities} />
                  <div className="mt-4">{seeAll('/cities')}</div>
                </div>
                {countryMap}
              </div>
            ) : null,
        },
        {
          id: 'travel',
          title: t('country.section.travel', 'Travel'),
          variant: 'compact',
          presentation: 'disclosure',
          preview: (
            <div
              className={
                cities.length === 0 && hasMap
                  ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]'
                  : undefined
              }
            >
              <CountryFactSheet country={country} weatherNow={weatherNow} scope="essentials" />
              {cities.length === 0 ? countryMap : null}
            </div>
          ),
          content: (
            <div className="flex flex-col gap-6">
              <CountryFactSheet country={country} scope="reference" />
              <CountryTravelTab
                country={country}
                activitiesTitle={t('country.travel.activities', 'Activities & tours')}
                noDealsTitle={t(
                  'country.travel.noDealsTitle',
                  "We don't promote travel deals for destinations where LGBTQ+ people face criminal penalties.",
                )}
                noDealsBody={t(
                  'country.travel.noDealsBody',
                  'If you need to travel to {{country}}, read the rights section on this page first and use the trip planner — it includes a safety briefing for high-risk destinations.',
                  { country: country.name },
                )}
              />
            </div>
          ),
        },
        {
          id: 'photos',
          title: t('venues.photos', 'Photos'),
          variant: 'compact',
          content: photos.length ? <CountryPhotoGallery photos={photos} /> : null,
        },
        {
          id: 'rights',
          title: t('country.section.rights', 'Rights & safety'),
          content: (
            <>
              <CountryRightsTab country={country} />
              {/* Self-hiding on data; see the component header. Placed above the
                  legal record because it is about the reader's own documents. */}
              <TransSafetyBand country={country as unknown as Record<string, unknown>} />
              {legalStations.length ? (
                <div id="history" className="mt-8 scroll-mt-32">
                  <h3 className="text-title font-bold leading-tight">
                    {t('country.section.history', 'Legal record')}
                  </h3>
                  <p className="mt-1 text-13 leading-relaxed text-muted-foreground">
                    {t(
                      'country.section.historyNote',
                      'What changed and when. Safety information without a date is not safety information.',
                    )}
                  </p>
                  <div className="mt-4">
                    <CountryLegalRecord countryName={country.name} stations={legalStations} />
                  </div>
                </div>
              ) : null}
            </>
          ),
        },
        {
          id: 'venues',
          title: t('country.section.venues', 'Venues'),
          presentation: 'disclosure',
          content: venues.length > 0 ? <CountryVenuesTab venues={venues} /> : null,
        },
        {
          id: 'events',
          title: t('country.section.events', 'Next departures'),
          presentation: 'disclosure',
          content:
            events.length > 0 ? (
              <CountryEventsTab
                events={events}
                locale={i18n.language}
                openLabel={t('cities.detail.openEvent', 'Open')}
              />
            ) : null,
        },
        {
          id: 'about',
          title: t('country.section.about', 'About {{country}}', {
            country: editorial?.name ?? country.name,
          }),
          presentation: 'disclosure',
          content: editorial?.description ? (
            <div className="max-w-reading space-y-4 text-body-lg leading-relaxed">
              {splitProseParagraphs(editorial.description).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : null,
        },
        {
          id: 'stats',
          title: t('country.section.stats', 'In numbers'),
          variant: 'compact',
          presentation: 'disclosure',
          content: hasStats ? (
            <CountryStatsBand country={country} worldBankData={worldBankData} sdgData={sdgData} />
          ) : null,
        },
        {
          id: 'news',
          title: t('country.section.news', 'News'),
          variant: 'compact',
          presentation: 'disclosure',
          content:
            articles.length > 0 ? (
              <CountryNewsTab
                articles={articles}
                locale={i18n.language}
                openLabel={t('cities.detail.openEvent', 'Open')}
                onViewArticle={incrementViews}
              />
            ) : null,
        },
      ])
    : [];

  const { activeId, select } = useGeoActiveSection(sections);

  if (loading) {
    return (
      <PageContainer>
        <TrackLoader label={t('country.loading', 'Loading country')} />
      </PageContainer>
    );
  }

  if (!country) {
    return (
      <PageContainer>
        <h1 className="font-display text-display leading-none">
          {t('country.notFound.title', 'Country not found')}
        </h1>
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          {t('country.notFound.body', "The country you're looking for doesn't exist.")}
        </p>
        <LocalizedLink
          to="/places"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          {t('country.notFound.back', 'All places')}
        </LocalizedLink>
      </PageContainer>
    );
  }

  // Rendered unconditionally, zeros included — a masthead row that appears and
  // disappears shifts the page under the reader (the /marketplace lesson).
  const census = [
    t('country.census.cities', '{{n}} cities', { n: cities.length }),
    t('country.census.stops', '{{n}} stops', { n: venues.length }),
    t('country.census.departures', '{{n}} departures', { n: events.length }),
  ];
  const countryName = editorial?.name ?? country.name;

  const eyebrowParts = [t('country.eyebrow', 'Country')];
  if (country.continents?.name) eyebrowParts.push(country.continents.name);

  return (
    <SinglePage
      type="country"
      eyebrow={eyebrowParts.join(' · ')}
      title={country.flag_emoji ? `${country.flag_emoji} ${countryName}` : countryName}
      lead={editorial?.hook ? <GlossaryLinkedText text={editorial.hook} /> : undefined}
      tags={<GeoCensus type="country" items={census} />}
      action={
        <>
          <PlanTripFromHereButton
            initialGeo={null}
            label={
              hasAnyCriminalizationSignal(country.lgbti_criminalization)
                ? t('country.planTripHighRisk', {
                    defaultValue: 'Plan carefully — safety briefing included',
                  })
                : t('country.planTrip', {
                    defaultValue: 'Plan a trip to {{country}}',
                    country: countryName,
                  })
            }
          />
          <LocationActionMenu label={t('common.moreActions', 'More actions')}>
            <CountryActions country={country} onContentUpdated={refetchCountry} />
          </LocationActionMenu>
        </>
      }
      body={
        <>
          {/* Safety first, full width, above everything — including the
              criminalisation banner, which used to render OUTSIDE the layout
              and therefore outside the page container. */}
          <GeoSafetyBanner
            criminalization={country.lgbti_criminalization as Record<string, unknown> | null}
            countryName={countryName}
            countryId={country.id}
          />
          <TripCoveringBanner target={{ type: 'country', countryId: country.id }} />
          <section aria-label={t('country.overview', 'Overview')}>
            <SafetyVerdict countryId={country.id} equalityScore={country.equality_score ?? null} />
          </section>
          <GeoRouteRail
            sections={sections}
            activeId={activeId}
            onNavigate={select}
            orientation="horizontal"
            track="yellow"
            label={t('country.sections', 'Sections')}
          />
          <GeoSectionList sections={sections} />
        </>
      }
      footer={
        <div className="flex flex-col gap-12">
          {/* Composite rails live here, not in `sections`: each self-hides from
              inside its own body, which the section filter cannot see, so a
              station would point at an empty heading. */}
          <LocationExploreMore
            title={t('country.exploreMore', 'Explore beyond {{country}}', { country: countryName })}
            groups={[
              {
                id: 'country-people',
                title: t('country.explorePeople', 'People and culture'),
                summary: t('country.explorePeopleNote', 'Queer lives connected to this country.'),
                content: <PersonalitiesForEntity countryId={country.id} cityName={country.name} />,
              },
              {
                id: 'country-destinations',
                title: t('country.exploreDestinations', 'More destinations'),
                summary: t(
                  'country.exploreDestinationsNote',
                  'Compare another country when you are ready.',
                ),
                content: (
                  <SimilarItems
                    entity={{ type: 'country', id: country.id }}
                    title={t('country.similar', 'More destinations')}
                    contentTypes={['country']}
                  />
                ),
              },
            ]}
          />
          <ProvenanceLine addedAt={country.created_at} checkedAt={null} correctHref="/contact" />
          <nav
            aria-label={t('country.endOfLine.title', 'Compare the law elsewhere')}
            className="flex flex-wrap gap-2"
          >
            <LocalizedLink to="/rights" className={FOOTER_LINK}>
              {t('country.endOfLine.rights', 'Rights across the world')}
            </LocalizedLink>
            <LocalizedLink to="/cities" className={FOOTER_LINK}>
              {t('cities.detail.endOfLine.allCities', 'All cities')}
            </LocalizedLink>
          </nav>
        </div>
      }
    />
  );
}
