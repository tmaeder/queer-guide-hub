import { useEffect, useMemo } from 'react';
import { CalendarDays, MapPin, Moon, Sparkles, Star } from '@/components/icons';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { GoingOutPlaces } from '@/components/intent/GoingOutPlaces';
import { eventTypesFor, parsePlaceView } from '@/lib/goingOutFilters';
import { UpcomingEvents } from '@/components/intent/UpcomingEvents';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { useCityTransitService } from '@/hooks/useCityTransitService';
import { CityLateNightPanel } from '@/components/geo/CityLateNightPanel';
import { GatedContentNotice } from '@/components/safety/GatedContentNotice';
import { CityLandmarksRail } from '@/components/geo/CityLandmarksRail';
import { useCityLandmarks } from '@/hooks/useGeoPlaces';
import {
  useNightlifeVenues,
  useEventsWithFallback,
  useHighlightEvents,
} from '@/hooks/useIntentData';
import { useHomeRegion, type HomeRegionApi } from '@/hooks/useHomeRegion';
import { readOverride } from '@/hooks/regionOverride';
import type { SectionDef } from '@/components/entity/editorial';
import { PageIntro } from '@/components/layout/PageIntro';
import { GoingOutHighlights } from '@/components/intent/GoingOutHighlights';
import { GoingOutFestivals } from '@/components/intent/GoingOutFestivals';
import {
  GoingOutInterests,
  hasInterests,
  type InterestSelection,
} from '@/components/intent/GoingOutInterests';
import { RegionChip } from '@/components/home/RegionChip';
import { WhenChips } from '@/components/intent/WhenChips';
import { NoStationTrack } from '@/components/transit/NoStationTrack';
import {
  parseWhen,
  sameWhen,
  serializeWhen,
  useWhen,
  whenRange,
  type When,
} from '@/lib/whenSelection';
import './going-out.css';

const listParam = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export default function GoingOut() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const citySlug = params.get('city');
  const typeId = params.get('type');
  const placeId = params.get('place');
  const interests: InterestSelection = {
    type: typeId,
    groups: listParam(params.get('groups')),
    tags: listParam(params.get('tags')),
    access: listParam(params.get('access')),
  };
  const view = parsePlaceView(params.get('view'));
  const setParam = (key: string, value: string | null) =>
    setParams(
      (cur) => {
        const next = new URLSearchParams(cur);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  const setParamsMany = (values: Record<string, string | null>) =>
    setParams(
      (cur) => {
        const next = new URLSearchParams(cur);
        for (const [k, v] of Object.entries(values)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  const {
    cityId,
    countryId,
    countryCode,
    cityName,
    citySlug: resolvedSlug,
    inferred,
    loading: locLoading,
  } = useIntentLocation(citySlug);

  // City and date are shared with the homepage: a pick here becomes the
  // homepage's region and "when", and a pick there is what this page opens on.
  // The URL wins when it names one, so a shared link shows what was shared.
  const home = useHomeRegion();
  const [sessionWhen, setSessionWhen] = useWhen();
  const urlWhen = parseWhen(params.get('when'));
  const when: When | null = urlWhen ?? sessionWhen;
  const whenKey = serializeWhen(when);
  const range = useMemo(() => (when ? whenRange(when) : null), [whenKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const setWhen = (next: When | null) => {
    setSessionWhen(next);
    setParam('when', serializeWhen(next));
  };

  // An explicit ?city= / ?when= in the URL is carried over to the homepage too.
  const { setRegion } = home;
  useEffect(() => {
    if (!citySlug || !cityId || readOverride()?.cityId === cityId) return;
    setRegion({
      cityId,
      citySlug: resolvedSlug,
      cityName,
      countryId,
      countryCode,
      countryName: null,
    });
  }, [citySlug, cityId, resolvedSlug, cityName, countryId, countryCode, setRegion]);
  useEffect(() => {
    if (urlWhen && !sameWhen(urlWhen, sessionWhen)) setSessionWhen(urlWhen);
  }, [params.get('when')]); // eslint-disable-line react-hooks/exhaustive-deps

  const region: HomeRegionApi = {
    ...home,
    cityId: cityId ?? null,
    citySlug: resolvedSlug ?? null,
    cityName: cityName ?? null,
    countryId: countryId ?? null,
    countryCode: countryCode ?? null,
    countryName: null,
    // A city in the URL is a choice, so "Use my area" is offered to undo it.
    source: citySlug ? 'override' : home.source,
    inferred,
    loading: locLoading,
    setRegion: (next) => {
      home.setRegion(next);
      setParam('city', next?.citySlug ?? null);
    },
  };

  const interestFilters = {
    tags: interests.tags,
    targetGroups: interests.groups,
    access: interests.access,
  };

  const { data: venues, isLoading: venuesLoading } = useNightlifeVenues(cityId, 12);
  // Unfiltered result feeds the hero highlights; the filtered one feeds the list.
  const { data: eventsResult } = useEventsWithFallback(cityId, 6, undefined, { range });
  const eventTypes = eventTypesFor(typeId);
  const { data: filteredEvents } = useEventsWithFallback(cityId, 8, eventTypes, {
    range,
    ...interestFilters,
  });
  const { data: festivals } = useHighlightEvents({ cityId, countryId, range });
  // Same query CityLandmarksRail runs; react-query dedupes it. Used only to
  // decide whether the "Scenes" section should exist at all.
  const { data: landmarks } = useCityLandmarks(cityId ?? undefined);
  // Same query the panel runs (deduped), so the section and its content cannot disagree.
  const { data: transit } = useCityTransitService(cityId);

  const where = cityName ?? 'your area';

  useMeta({
    title: 'Going out — LGBTQ+ bars, clubs and nightlife',
    description:
      'Where to go out tonight: queer bars, clubs, cafés and saunas, plus what is actually on, wherever you are.',
    canonicalPath: '/going-out',
  });

  const sections: SectionDef[] = [
    {
      id: 'highlights',
      icon: Star,
      label: t('goingOut.festivals.label', 'Highlights'),
      kicker: t('goingOut.festivals.kicker', 'Prides and festivals worth the trip'),
      // Hidden only once the answer is "none". Hiding it while loading makes the
      // first section flip, and the layout then writes and scrolls to ?section=.
      hidden: festivals?.length === 0,
      content: festivals ? (
        <GoingOutFestivals events={festivals} cityId={cityId ?? null} />
      ) : (
        <p className="text-muted-foreground">{t('common.loading', 'Loading…')}</p>
      ),
      action: (
        <LocalizedLink
          to="/events?types=pride,festival,fair"
          className="text-13 no-underline hover:underline"
        >
          {t('goingOut.festivals.all', 'All festivals')}
        </LocalizedLink>
      ),
    },
    {
      id: 'whats-on',
      icon: CalendarDays,
      label: "What's on",
      content: (
        <UpcomingEvents
          eventsResult={
            eventTypes || hasInterests(interests)
              ? filteredEvents
              : (filteredEvents ?? eventsResult)
          }
          cityName={cityName}
          variant="going-out"
        />
      ),
      action: (
        <LocalizedLink to="/events" className="text-13 no-underline hover:underline">
          All events
        </LocalizedLink>
      ),
    },
    {
      id: 'plan',
      icon: MapPin,
      label: 'Where to go',
      kicker: cityName ? `Places in ${cityName}` : 'Places near you',
      content: locLoading ? (
        <p className="text-muted-foreground">Finding places…</p>
      ) : (
        <div className="space-y-4">
          <GoingOutPlaces
            cityId={cityId ?? null}
            countryId={countryId ?? null}
            where={where}
            placeId={placeId}
            view={view}
            interests={interestFilters}
            onPlaceChange={(id) => setParam('place', id)}
            onViewChange={(v) => setParam('view', v === 'grid' ? null : v)}
            empty={
              <div className="going-out-empty">
                <div className="going-out-empty__copy">
                  <div>
                    <strong>No places listed for {where} yet.</strong>
                    <p>
                      Take the full directory or map route, or put a place the community should know
                      about on the guide.
                    </p>
                  </div>
                  <div className="going-out-empty__links">
                    <LocalizedLink to="/venues">Browse every venue</LocalizedLink>
                    <LocalizedLink to="/map">Open the map</LocalizedLink>
                    <LocalizedLink to="/submit">Add a place</LocalizedLink>
                  </div>
                </div>
                <div className="going-out-empty__map" aria-hidden="true">
                  <NoStationTrack />
                </div>
              </div>
            }
          />
          {/* Anon-safe: gated_count_for_location returns COUNTS only, never rows,
              so this can tell a signed-out reader that content exists in a
              criminalising country without exposing any of it. */}
          <GatedContentNotice cityId={cityId ?? undefined} />
        </div>
      ),
      action: (
        <LocalizedLink
          to={cityName ? `/venues?city=${encodeURIComponent(cityName)}` : '/venues'}
          className="text-13 no-underline hover:underline"
        >
          All venues
        </LocalizedLink>
      ),
    },
    {
      id: 'scenes',
      icon: Sparkles,
      label: 'Scenes',
      kicker: 'Neighborhoods with their own gravity',
      // "Self-hiding" was only ever true of the RAIL, not the SECTION.
      // CityLandmarksRail returns null with no landmarks — the common case
      // outside the deepest 71 cities — but EditorialSection still emitted the
      // kicker, the <h2> and a live nav anchor over an empty div. Verified in
      // production in Zürich. `hidden` uses the same hook the rail does, so the
      // two cannot disagree; the query is deduped by react-query.
      hidden: !landmarks || landmarks.length === 0,
      content: cityId ? <CityLandmarksRail cityId={cityId} /> : null,
    },
    {
      id: 'getting-home',
      icon: Moon,
      label: 'Getting home',
      kicker: 'When the last tram leaves',
      hidden: !transit || transit.length === 0,
      content: cityId ? <CityLateNightPanel cityId={cityId} showHeading={false} /> : null,
    },
  ];

  const title = cityName
    ? t('pages.goingOut.titleCity', 'Going out in {{city}}', { city: cityName })
    : t('header.intents.goingOut.label', 'Going out');
  const lede = t(
    'pages.goingOut.intro',
    'Find queer bars, clubs, cafés and saunas, and see what events are coming up.',
  );

  return (
    <IntentPageLayout
      className="going-out-page"
      breadcrumbLabel={t('header.intents.goingOut.label', 'Going out')}
      breadcrumbHref="/going-out"
      sectionNavVariant="subway"
      title={title}
      lede={lede}
      header={
        <header className="going-out-hero grid items-center gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
          <div className="min-w-0">
            <PageIntro title={title} lede={lede} />
            <div className="mt-6 flex flex-col gap-2">
              <RegionChip region={region} align="start" />
              <WhenChips value={when} onChange={setWhen} />
              <GoingOutInterests
                value={interests}
                onChange={(next) =>
                  setParamsMany({
                    type: next.type,
                    groups: next.groups.join(',') || null,
                    tags: next.tags.join(',') || null,
                    access: next.access.join(',') || null,
                  })
                }
              />
            </div>
          </div>
          <GoingOutHighlights
            venues={venues}
            eventsResult={locLoading ? undefined : eventsResult}
            cityName={cityName}
            waitingForVenues={locLoading || venuesLoading}
          />
        </header>
      }
      sections={sections}
    />
  );
}
