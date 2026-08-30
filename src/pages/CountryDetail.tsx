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
import { SinglePage, StickyRailGroup } from '@/components/transit/SinglePage';
import { ProvenanceLine } from '@/components/transit/ProvenanceLine';
import { ClampedProse } from '@/components/ui/ClampedProse';
import { SafetyVerdict } from '@/components/country/SafetyVerdict';
import { CountryFactSheet } from '@/components/country/CountryFactSheet';
import { CountryStatsBand } from '@/components/country/CountryStatsBand';
import { GeoCensus } from '@/components/geo/GeoCensus';
import { GeoPhotoInset } from '@/components/geo/GeoPhotoInset';
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
import { MarketplaceForCountry } from '@/components/marketplace/MarketplaceForCountry';
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

const OUTLINE_ON_INK =
  'border inline-flex items-center gap-2 border-background px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground';

export default function CountryDetail() {
  const { slug: countrySlug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const { track } = useTrackEvent();
  const navigate = useLocalizedNavigate();

  const { country, loading, refetch: refetchCountry } = useOptimizedCountry(countrySlug ?? '');

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
  const { data: legalRecord } = useMilestonesForCountry(country?.id, 12);

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
  useEffect(() => {
    if (!isNoindex) return;
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
  }, [isNoindex]);

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
            { label: country.name },
          ]
        : null,
    [country, t],
  );
  useBreadcrumbs(breadcrumbs);

  const seeAll = (href: string) => (
    <SeeAllLink to={href} label={t('cities.detail.seeAll', 'See all')} />
  );

  // Spec module order for `country`: 01 fact strip, 05 stop list (cities),
  // 12 version history (the OWNER module), 15 stat line, 16 map inset.
  // Built unconditionally so the route rail's stations and the rendered list
  // come from one array, and so the hook below never sits behind an early
  // return.
  //
  // The legal record is a SUB-BLOCK of rights, not its own station: the
  // timeline is the rights story's evidence, and folding it in moved #rights —
  // the reason the platform exists — one full section higher. The wrapper
  // keeps id="history" so old #history deep links still land.
  const sections: GeoSection[] = country
    ? geoSections([
        {
          id: 'rights',
          title: t('country.section.rights', 'Rights & safety'),
          content: (
            <>
              <CountryRightsTab country={country} />
              {/* Self-hiding on data; see the component header. Placed above the
                  legal record because it is about the reader's own documents. */}
              <TransSafetyBand country={country as unknown as Record<string, unknown>} />
              {legalRecord?.length ? (
                <div id="history" className="mt-10 scroll-mt-8">
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
                    <CountryLegalRecord
                      countryId={country.id}
                      countryName={country.name}
                      seeAllLabel={t('country.history.seeAll', 'Full timeline')}
                    />
                  </div>
                </div>
              ) : null}
            </>
          ),
        },
        {
          id: 'cities',
          title: t('country.section.cities', 'Cities'),
          content:
            cities.length > 0 ? (
              <>
                <CountryCitiesTab cities={cities} />
                <div className="mt-6">{seeAll('/cities')}</div>
              </>
            ) : null,
        },
        {
          id: 'venues',
          title: t('country.section.venues', 'Venues'),
          content: venues.length > 0 ? <CountryVenuesTab venues={venues} /> : null,
        },
        {
          id: 'events',
          title: t('country.section.events', 'Next departures'),
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
          id: 'travel',
          title: t('country.section.travel', 'Travel'),
          variant: 'compact',
          content: (
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
          ),
        },
        {
          id: 'stats',
          title: t('country.section.stats', 'In numbers'),
          variant: 'compact',
          content: hasStats ? (
            <CountryStatsBand country={country} worldBankData={worldBankData} sdgData={sdgData} />
          ) : null,
        },
        {
          id: 'news',
          title: t('country.section.news', 'News'),
          variant: 'compact',
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

  const eyebrowParts = [t('country.eyebrow', 'Country')];
  if (country.continents?.name) eyebrowParts.push(country.continents.name);

  const weatherNow = weatherData?.current?.temperature ?? weatherData?.temperature ?? null;

  return (
    <SinglePage
      type="country"
      eyebrow={eyebrowParts.join(' · ')}
      title={country.flag_emoji ? `${country.flag_emoji} ${country.name}` : country.name}
      lead={country.editorial_hook || country.description}
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
                    country: country.name,
                  })
            }
          />
          <CountryActions country={country} onContentUpdated={refetchCountry} />
        </>
      }
      body={
        <>
          {/* Safety first, full width, above everything — including the
              criminalisation banner, which used to render OUTSIDE the layout
              and therefore outside the page container. */}
          <GeoSafetyBanner
            criminalization={country.lgbti_criminalization as Record<string, unknown> | null}
            countryName={country.name}
            countryId={country.id}
          />
          {/* `SafetyVerdict`, not the shared `GeoSafetyVerdict`: this is the
              richer country-specific component, it owns the death-penalty
              re-escalation, and six e2e assertions in rights-safety.spec.ts
              bind to its copy. It stays full width in the body rather than
              moving to the 360px rail. */}
          <SafetyVerdict countryId={country.id} equalityScore={country.equality_score ?? null} />
          <TripCoveringBanner target={{ type: 'country', countryId: country.id }} />
          {/* The briefing band — spec module 01 (fact strip) as ONE compact
              surface. `editorial_long` arrives as an unbroken string (2,569px
              of <p> on Iran before the clamp); `CountryFactSheet` merges the
              old FactGrid + CountryPracticalInfo pair and absorbs the rail
              StatLine's one non-duplicate cell (weather). The photo sits
              beside the facts instead of claiming its own 400px band. Both
              stay in the body slot: the sheet's 2-col grid and the photo need
              more than the 360px rail. */}
          {country.editorial_long && (
            <ClampedProse
              text={country.editorial_long}
              moreLabel={t('country.editorial.more', 'Read more')}
              lessLabel={t('country.editorial.less', 'Show less')}
              className="max-w-reading text-body-lg leading-relaxed"
            />
          )}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <CountryFactSheet country={country} weatherNow={weatherNow} />
            <GeoPhotoInset
              src={resolveEntityImage('country', country).url}
              alt={country.name}
              fallbackKey={country.id}
              priority
              caption={country.capital ?? null}
            />
          </div>
          <GeoRouteRail
            sections={sections}
            activeId={activeId}
            onNavigate={select}
            orientation="horizontal"
            track="yellow"
            label={t('country.sections', 'Sections')}
            className="lg:hidden"
          />
          <GeoSectionList sections={sections} />
        </>
      }
      rail={
        <>
          <CountryMapTab
            country={country}
            caption={country.capital ?? undefined}
            openLabel={t('country.openMap', 'Open the full map')}
          />
          {/* The StatLine block is gone: cities/venues/events triplicated the
              census strip and weather moved into the fact sheet. What remains
              follows the reader — the aside stretches to the full body height,
              so the sticky group keeps the TOC on screen for the whole page
              instead of scrolling away 1,500px in. */}
          <StickyRailGroup>
            <GeoRouteRail
              sections={sections}
              activeId={activeId}
              onNavigate={select}
              orientation="vertical"
              track="yellow"
              label={t('country.sections', 'Sections')}
              className="hidden lg:block"
            />
            {/* `checkedAt` is null on purpose, and the component then prints
                "Not independently checked yet." `countries` has no
                `last_verified_at` column — unlike `cities` and
                `queer_villages`, which do — so there is no check date to
                state. Saying so out loud beats implying freshness by
                omission. */}
            <ProvenanceLine addedAt={country.created_at} checkedAt={null} correctHref="/contact" />
          </StickyRailGroup>
        </>
      }
      footer={
        <div className="flex flex-col gap-12">
          {/* Composite rails live here, not in `sections`: each self-hides from
              inside its own body, which the section filter cannot see, so a
              station would point at an empty heading. */}
          <PersonalitiesForEntity countryId={country.id} cityName={country.name} />
          {/* `NearbyTriptych` is not here any more. Its only country-anchored
              panel was the equality-score peer table, removed with the rest of
              the composite figure; the band this page passed props for would
              now render empty. It stays on /city/:slug, which has the
              city-anchored "Next leg from here". */}
          <MarketplaceForCountry countryId={country.id} countryName={country.name} />
          <SimilarItems
            entity={{ type: 'country', id: country.id }}
            title={t('country.similar', 'More destinations')}
            contentTypes={['country']}
          />
          <section
            aria-labelledby="country-end-of-line"
            className="bg-foreground p-6 text-background md:p-8"
          >
            <p className="text-2xs font-bold uppercase tracking-label text-background/70">
              {t('country.endOfLine.eyebrow', 'End of line')}
            </p>
            <h2 id="country-end-of-line" className="mt-1 font-display text-headline leading-tight">
              {t('country.endOfLine.title', 'Compare the law elsewhere')}
            </h2>
            <p className="mt-2 max-w-reading text-13 leading-relaxed text-background/80">
              {t(
                'country.endOfLine.body',
                'Every country page carries the same legal breakdown, from the same sources, with the date it was checked.',
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <LocalizedLink to="/rights" className={OUTLINE_ON_INK}>
                {t('country.endOfLine.rights', 'Rights across the world')}
              </LocalizedLink>
              <LocalizedLink to="/cities" className={OUTLINE_ON_INK}>
                {t('cities.detail.endOfLine.allCities', 'All cities')}
              </LocalizedLink>
            </div>
          </section>
        </div>
      }
    />
  );
}
