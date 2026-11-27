import { useEffect, useMemo } from 'react';
import { CalendarDays, MapPin, Sparkles, Star } from '@/components/icons';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { GoingOutPlaces, PlacesMenu, PlaceViewSwitch } from '@/components/intent/GoingOutPlaces';
import {
  ALL_PLACE_CATEGORIES,
  PLACE_FILTERS,
  eventTypesFor,
  parsePlaceView,
} from '@/lib/goingOutFilters';
import { UpcomingEvents } from '@/components/intent/UpcomingEvents';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { GatedContentNotice } from '@/components/safety/GatedContentNotice';
import { CityLandmarksRail } from '@/components/geo/CityLandmarksRail';
import { useCityLandmarks } from '@/hooks/useGeoPlaces';
import {
  useNightlifeVenues,
  useEventsWithFallback,
  useHighlightEvents,
} from '@/hooks/useIntentData';
import { useHomeRegion, type HomeRegionApi } from '@/hooks/useHomeRegion';
import { useGatedCount } from '@/hooks/useGatedCount';
import { readOverride } from '@/hooks/regionOverride';
import type { SectionDef } from '@/components/entity/editorial';
import { PageIntro } from '@/components/layout/PageIntro';
import { GoingOutHighlights } from '@/components/intent/GoingOutHighlights';
import { GoingOutFestivals } from '@/components/intent/GoingOutFestivals';
import { InterestsMenu, InterestPills } from '@/components/intent/GoingOutInterests';
import {
  NO_INTERESTS,
  hasInterests,
  summarizeInterests,
  useInterestOptions,
  type InterestSelection,
} from '@/hooks/useInterestOptions';
import { RegionChip } from '@/components/home/RegionChip';
import { WhenMenu } from '@/components/intent/WhenChips';
import {
  formatWhen,
  parseWhen,
  readWhen,
  sameWhen,
  serializeWhen,
  useWhen,
  whenRange,
  type When,
} from '@/lib/whenSelection';
import './going-out.css';

const listParam = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export default function GoingOut() {
  const { t, i18n } = useTranslation();
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
  // Keyed on the serialised form: a picked day parses to a fresh object every
  // render, and whenRange clamps to "now", so keying on `when` would refetch
  // on every render.
  const range = useMemo(() => {
    const w = parseWhen(whenKey);
    return w ? whenRange(w) : null;
  }, [whenKey]);
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
  const whenParam = params.get('when');
  useEffect(() => {
    const w = parseWhen(whenParam);
    if (w && !sameWhen(w, readWhen())) setSessionWhen(w);
  }, [whenParam, setSessionWhen]);

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
  const { data: festivals } = useHighlightEvents({
    cityId,
    countryId,
    range,
    interests: interestFilters,
  });

  // One sentence per section saying what it is scoped to, so the sticky
  // toolbar's choices are visible where they take effect.
  const { active } = useInterestOptions(interests);
  const forPlaces = summarizeInterests(active.filter((a) => !a.key.startsWith('type:')));
  const forEvents = summarizeInterests(active);
  const whenText = formatWhen(when, t, i18n.language);
  const placeFilter = PLACE_FILTERS.find((f) => f.id === placeId);
  const placeLabel = placeFilter
    ? t(`goingOut.places.types.${placeFilter.id}`, placeFilter.label)
    : null;
  const scope = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
  const setInterests = (next: InterestSelection) =>
    setParamsMany({
      type: next.type,
      groups: next.groups.join(',') || null,
      tags: next.tags.join(',') || null,
      access: next.access.join(',') || null,
    });
  // Same query CityLandmarksRail runs; react-query dedupes it. Used only to
  // decide whether the "Scenes" section should exist at all.
  const { data: landmarks } = useCityLandmarks(cityId ?? undefined);

  const where = cityName ?? 'your area';

  useMeta({
    title: 'Going out — LGBTQ+ bars, clubs and nightlife',
    description:
      'Where to go out tonight: queer bars, clubs, cafés and saunas, plus what is actually on, wherever you are.',
    canonicalPath: '/going-out',
  });

  const shownEvents =
    eventTypes || hasInterests(interests) ? filteredEvents : (filteredEvents ?? eventsResult);
  // Where to go hides when its venue list has loaded empty. The same query
  // GoingOutPlaces runs (identical key, so react-query shares it). Organisations,
  // neighbourhoods and the map have their own sources and always show.
  const placeVenues = useNightlifeVenues(
    cityId,
    24,
    placeFilter?.kind === 'venues' ? placeFilter.categories : ALL_PLACE_CATEGORIES,
    !placeFilter || placeFilter.kind === 'venues',
    interestFilters,
  );
  const placesEmpty =
    view !== 'map' &&
    (!placeFilter || placeFilter.kind === 'venues') &&
    !locLoading &&
    (!cityId || placeVenues.data?.length === 0);
  // Places hidden from a signed-out reader are not "nothing listed": the
  // members-only notice below says what is there instead.
  const { total: gatedTotal } = useGatedCount(cityId);
  const allEmpty =
    gatedTotal === 0 && festivals?.length === 0 && shownEvents?.events.length === 0 && placesEmpty;

  const sections: SectionDef[] = [
    {
      id: 'highlights',
      icon: Star,
      label: t('goingOut.festivals.label', 'Highlights'),
      description:
        scope(
          when ? t('goingOut.festivals.from', 'From {{when}}', { when: whenText }) : null,
          forPlaces,
        ) || undefined,
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
      description: scope(when ? whenText : null, forEvents) || undefined,
      hidden: shownEvents?.events.length === 0,
      content: (
        <UpcomingEvents eventsResult={shownEvents} cityName={cityName} variant="going-out" />
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
      description: scope(placeLabel, forPlaces) || undefined,
      hidden: placesEmpty,
      content: locLoading ? (
        <p className="text-muted-foreground">Finding places…</p>
      ) : (
        <GoingOutPlaces
          cityId={cityId ?? null}
          countryId={countryId ?? null}
          where={where}
          placeId={placeId}
          view={view}
          interests={interestFilters}
          empty={null}
        />
      ),
      action: (
        <div className="flex items-center gap-4">
          <LocalizedLink
            to={cityName ? `/venues?city=${encodeURIComponent(cityName)}` : '/venues'}
            className="hidden text-13 no-underline hover:underline sm:inline"
          >
            All venues
          </LocalizedLink>
          <PlaceViewSwitch
            view={view}
            onViewChange={(v) => setParam('view', v === 'grid' ? null : v)}
          />
        </div>
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
          <PageIntro title={title} lede={lede} />
          <GoingOutHighlights
            venues={venues}
            eventsResult={locLoading ? undefined : eventsResult}
            cityName={cityName}
            waitingForVenues={locLoading || venuesLoading}
          />
        </header>
      }
      sections={sections}
      footer={
        <div className="space-y-4">
          {allEmpty ? (
            <p className="text-muted-foreground">
              {hasInterests(interests) || when
                ? t('goingOut.empty.filtered', 'Nothing listed for these choices yet.')
                : t('goingOut.empty.none', 'Nothing listed for {{where}} yet.', { where })}{' '}
              {hasInterests(interests) ? (
                <button
                  type="button"
                  onClick={() => setInterests(NO_INTERESTS)}
                  className="min-h-11 font-bold underline underline-offset-4"
                >
                  {t('goingOut.interests.clear', 'Clear filters')}
                </button>
              ) : (
                <LocalizedLink to="/submit">{t('goingOut.empty.add', 'Add a place')}</LocalizedLink>
              )}
            </p>
          ) : null}
          {/* Anon-safe: gated_count_for_location returns COUNTS only, never rows,
              so this can tell a signed-out reader that content exists in a
              criminalising country without exposing any of it. It sits outside
              the sections because in exactly that case they are empty and hidden. */}
          <GatedContentNotice cityId={cityId ?? undefined} />
        </div>
      }
      navToolbar={
        // One row that scrolls sideways on a phone rather than wrapping: this
        // block is sticky, so every extra line is screen lost on every scroll.
        <div className="-mx-4 flex min-w-0 items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
          <RegionChip region={region} align="start" />
          <WhenMenu value={when} onChange={setWhen} />
          <InterestsMenu value={interests} onChange={setInterests} />
          <PlacesMenu placeId={placeId} onPlaceChange={(id) => setParam('place', id)} />
          <InterestPills value={interests} onChange={setInterests} />
        </div>
      }
    />
  );
}
