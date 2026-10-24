import { useState, useEffect, useMemo, useCallback } from 'react';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { useAccessibilityAttributes } from '@/hooks/useAccessibilityAttributes';
import { useTargetGroups } from '@/hooks/useTargetGroups';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useDebounce } from '@/hooks/useDebounce';
import { getPresetDateRange, type EventPresetId } from '@/components/events/PresetChips';
import {
  hasAnyFilter,
  parseFilterState,
  serializeFilterState,
  type EventSort,
} from '@/utils/eventsQueryString';
import type { EventFilters, FeedRequest } from '@/hooks/useEvents';

const PAGE_SIZE = 24;

/**
 * Owns the Events-page filter state: 18 filter dimensions, preset toggles,
 * geolocation/near-me, URL serialize/hydrate and the timeline viewport.
 *
 * It does not fetch. It DERIVES the feed request from that state and returns
 * it as `request`; the page hands it to `useEventsFeed`. There used to be one
 * mount-guarded effect per filter dimension, each calling `fetchEvents` when
 * its value changed, plus a suppress flag so a preset did not fire twice.
 * Every one of them computed the same thing this memo now computes once, and
 * whichever ran last won.
 */
export function useEventFilters() {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Full filter-state URL sync (shareable, refreshable, bookmarkable).
  // Declared FIRST so the query string can seed the state below.
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * The URL is parsed during state INITIALISATION, not in a mount effect.
   *
   * It used to be hydrated by a `useEffect(..., [])` declared after the
   * mount-fetch effect, which meant the first query went out with default (or
   * geo-derived) filters and the URL's filters only reached the data layer one
   * commit later, as a second query. `fetchEvents` applied whichever response
   * resolved last, and the unfiltered one is the slower of the two — it counts
   * the whole upcoming corpus and pays a second round-trip for attendee counts
   * on its full page of rows, where a narrow city+date query often returns
   * nothing and skips that round-trip. So the stale unfiltered response landed
   * last and overwrote the correct results: chips right, cards wrong, on every
   * shared or bookmarked filter link.
   *
   * A lazy initialiser runs once, on the first render, before any effect — so
   * there is exactly one mount fetch and it already carries the URL.
   */
  const [initialFilters] = useState(() => parseFilterState(searchParams));
  // Geo defaulting is for a BARE /events only. A link that named any filter has
  // already said what it wants; scoping it to the reader's own city on top of
  // that silently changes the result set the sender shared. Read at first
  // render, as the mount effect it replaces read it on mount — the visitor's
  // city arriving later does not re-scope a list they are already looking at.
  const { location: visitorLocation } = useVisitorLocation();
  const [geoCity] = useState(() =>
    !hasAnyFilter(initialFilters) && visitorLocation?.city ? visitorLocation.city : null,
  );

  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline' | 'map'>(initialFilters.view);

  // Filter states
  const [search, setSearch] = useState(initialFilters.q);
  const [cities, setCities] = useState<string[]>(() =>
    geoCity ? [geoCity] : initialFilters.cities,
  );
  const [eventTypes, setEventTypes] = useState<string[]>(initialFilters.types);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialFilters.tags);
  const [startDate, setStartDate] = useState<Date | undefined>(() =>
    initialFilters.from ? new Date(initialFilters.from) : undefined,
  );
  const [endDate, setEndDate] = useState<Date | undefined>(() =>
    initialFilters.to ? new Date(initialFilters.to) : undefined,
  );
  const [nearMe, setNearMe] = useState(initialFilters.nearMe);
  const [showPast, setShowPast] = useState(initialFilters.showPast);
  const [isFree, setIsFree] = useState(initialFilters.isFree);
  const [featuredOnly, setFeaturedOnly] = useState(initialFilters.featured);
  const [activePreset, setActivePreset] = useState<EventPresetId | null>(null);
  const [sort, setSort] = useState<EventSort>(initialFilters.sort);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [autoLocationLabel, setAutoLocationLabel] = useState<string | null>(geoCity);
  // New filter dimensions (Phase B.2 + B.4)
  const [accessibilityAttrs, setAccessibilityAttrs] = useState<string[]>(
    initialFilters.accessibility,
  );
  // Not seeded from the URL: `serializeFilterState` has no key for target
  // groups, so this dimension is not shareable at all. Pre-existing gap, left
  // as-is — adding a key is a URL-schema change, not part of this fix.
  const [targetGroupsFilter, setTargetGroupsFilter] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(initialFilters.languages);
  const [ageRestriction, setAgeRestriction] = useState<string>(initialFilters.ageRestriction);
  const { accessibilityAttributes: accAttrOptions } = useAccessibilityAttributes();
  const { targetGroups: tgOptions } = useTargetGroups();

  // Timeline viewport drives a parallel date-range fetch when timeline view is active.
  const [timelineViewport, setTimelineViewportState] = useState<{
    startMs: number;
    endMs: number;
    /** Captured when the viewport is set, so the derived request stays pure. */
    includesPast: boolean;
  } | null>(null);
  const setTimelineViewport = useCallback(
    (v: { startMs: number; endMs: number } | null) =>
      setTimelineViewportState(v ? { ...v, includesPast: v.startMs < Date.now() } : null),
    [],
  );
  const debouncedViewport = useDebounce(timelineViewport, 350);

  // Debounced search — the list filters ~300ms after the user stops typing.
  // Enter (and the filter sheet's Apply) commit the typed value at once via
  // `handleFiltersChange`.
  const debouncedSearch = useDebounce(search, 300);
  const [committedSearch, setCommittedSearch] = useState<string | null>(null);
  const effectiveSearch = committedSearch === search ? search : debouncedSearch;

  /**
   * The feed request, derived from filter state — the ONE place a query for
   * this list is built. Built inline per call site, the page once passed `{}`
   * from "Load more" and both retry buttons, appending an unfiltered page 2
   * under a filtered page 1 and silently dropping the reader's filters on retry.
   *
   * In timeline view the viewport supplies the date window, as the debounced
   * viewport fetch used to; every other view uses the filter dates.
   */
  const request = useMemo<FeedRequest>(() => {
    const base = {
      search: effectiveSearch || undefined,
      cities: cities.length > 0 ? cities : undefined,
      eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      // `&& userLocation`: the toggle can be on before geolocation resolves.
      nearMe: nearMe && userLocation ? userLocation : undefined,
      featured: featuredOnly || undefined,
      isFree: isFree || undefined,
      sort,
    };
    let filters: EventFilters;
    if (viewMode === 'timeline' && debouncedViewport) {
      filters = {
        ...base,
        dateRange: {
          start: new Date(debouncedViewport.startMs).toISOString(),
          end: new Date(debouncedViewport.endMs).toISOString(),
        },
        includePast: debouncedViewport.includesPast || showPast || undefined,
      };
    } else {
      filters = {
        ...base,
        accessibilityAttributes: accessibilityAttrs.length > 0 ? accessibilityAttrs : undefined,
        targetGroups: targetGroupsFilter.length > 0 ? targetGroupsFilter : undefined,
        languages: languages.length > 0 ? languages : undefined,
        ageRestriction: ageRestriction || undefined,
        dateRange:
          startDate && endDate
            ? { start: startDate.toISOString(), end: endDate.toISOString() }
            : undefined,
        includePast: showPast || undefined,
      };
    }
    return { filters, paged: true, pageSize: PAGE_SIZE };
  }, [
    effectiveSearch,
    cities,
    eventTypes,
    selectedTags,
    nearMe,
    userLocation,
    featuredOnly,
    isFree,
    sort,
    viewMode,
    debouncedViewport,
    showPast,
    accessibilityAttrs,
    targetGroupsFilter,
    languages,
    ageRestriction,
    startDate,
    endDate,
  ]);

  /**
   * Commit the typed search now (Enter, Apply) instead of after the debounce.
   * Returns false when nothing changed, so the caller can refetch instead —
   * retry and the RSVP refresh re-run the same request.
   */
  const commitSearch = () => {
    if (effectiveSearch === search) return false;
    setCommittedSearch(search);
    return true;
  };

  const handlePresetSelect = async (preset: EventPresetId | null) => {
    // D6: toggling a preset OFF must fully reverse every state it set.
    // Previously eventType='pride' leaked after un-toggling Pride, and
    // isFree/featuredOnly were always cleared on every press (even when
    // activating a different preset that shouldn't touch them).
    const isToggleOff = preset === null || preset === activePreset;
    if (isToggleOff) {
      const wasActive = activePreset;
      setActivePreset(null);
      if (wasActive === 'pride') setEventTypes([]);
      if (wasActive === 'free') setIsFree(false);
      if (wasActive === 'featured') setFeaturedOnly(false);
      if (wasActive === 'this-weekend' || wasActive === 'this-month' || wasActive === 'pride') {
        setStartDate(undefined);
        setEndDate(undefined);
      }
      if (wasActive === 'near-me') {
        setNearMe(false);
        setUserLocation(null);
      }
      return;
    }
    // Activating a new preset: reset state owned by other presets first,
    // then apply this preset's state.
    setIsFree(false);
    setFeaturedOnly(false);
    if (activePreset === 'pride' && preset !== 'pride') setEventTypes([]);
    setActivePreset(preset);
    const range = getPresetDateRange(preset);
    if (range) {
      setStartDate(range.start);
      setEndDate(range.end);
    } else {
      setStartDate(undefined);
      setEndDate(undefined);
    }
    if (preset === 'pride') setEventTypes(['pride']);
    if (preset === 'free') setIsFree(true);
    if (preset === 'featured') setFeaturedOnly(true);
    if (preset === 'near-me') {
      await handleNearMe();
      return;
    }
  };

  const handleNearMe = async () => {
    if (!nearMe) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(location);
        setNearMe(true);

        // Clear city filter when using near me
        setCities([]);

        toast({
          title: t('pages.events.locationFound', 'Location found'),
          description: t('pages.events.nearLocationDesc', 'Showing events near your location'),
        });
      } catch (_error) {
        toast({
          title: t('pages.events.locationError', 'Location Error'),
          description: t(
            'pages.events.locationErrorDesc',
            'Unable to get your location. Please allow location access.',
          ),
          variant: 'destructive',
        });
      }
    } else {
      setNearMe(false);
      setUserLocation(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    // Clear at once rather than after the search debounce.
    setCommittedSearch('');
    setCities([]);
    setAutoLocationLabel(null);
    setEventTypes([]);
    setSelectedTags([]);
    setAccessibilityAttrs([]);
    setTargetGroupsFilter([]);
    setLanguages([]);
    setAgeRestriction('');
    setStartDate(undefined);
    setEndDate(undefined);
    setNearMe(false);
    setUserLocation(null);
    setShowPast(false);
    setIsFree(false);
    setFeaturedOnly(false);
    setActivePreset(null);
    setSort('date-asc');
  };

  const hasActiveFilters =
    search ||
    cities.length > 0 ||
    eventTypes.length > 0 ||
    selectedTags.length > 0 ||
    accessibilityAttrs.length > 0 ||
    targetGroupsFilter.length > 0 ||
    languages.length > 0 ||
    ageRestriction ||
    startDate ||
    endDate ||
    nearMe ||
    showPast ||
    isFree ||
    featuredOnly ||
    activePreset;

  /**
   * How many of the FILTER SHEET's own dimensions are set — the number on the
   * "Filters" badge in the control band. Deliberately narrower than
   * `hasActiveFilters`: search, the presets and the past-events toggle each have
   * their own visible control in the band, so counting them here would badge the
   * sheet for state the reader can already see and clear without opening it.
   */
  const sheetFilterCount =
    cities.length +
    eventTypes.length +
    selectedTags.length +
    accessibilityAttrs.length +
    targetGroupsFilter.length +
    languages.length +
    (ageRestriction ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0);

  // Write the current filter state back to the query string. On first render
  // this re-serialises what we just parsed, so it is a no-op or a pure
  // normalisation — it can no longer wipe the incoming URL before it is read.
  useEffect(() => {
    const next = serializeFilterState({
      q: debouncedSearch,
      cities,
      types: eventTypes,
      tags: selectedTags,
      accessibility: accessibilityAttrs,
      languages,
      ageRestriction,
      organizerId: '',
      from: startDate ? startDate.toISOString() : undefined,
      to: endDate ? endDate.toISOString() : undefined,
      nearMe,
      showPast,
      isFree,
      featured: featuredOnly,
      sort,
      view: viewMode,
    });
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cities,
    debouncedSearch,
    eventTypes,
    selectedTags,
    accessibilityAttrs,
    languages,
    ageRestriction,
    startDate,
    endDate,
    nearMe,
    showPast,
    isFree,
    featuredOnly,
    sort,
    viewMode,
  ]);

  // (The mount-time URL hydration effect that used to live here is gone: every
  // dimension it set is now a lazy `useState` initialiser above, which runs
  // before the mount fetch instead of after it.)

  return {
    PAGE_SIZE,
    // view / panel state
    showFilters,
    setShowFilters,
    viewMode,
    setViewMode,
    // filter state + setters
    search,
    setSearch,
    cities,
    setCities,
    eventTypes,
    setEventTypes,
    selectedTags,
    setSelectedTags,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    nearMe,
    setNearMe,
    showPast,
    setShowPast,
    isFree,
    setIsFree,
    featuredOnly,
    setFeaturedOnly,
    activePreset,
    setActivePreset,
    sort,
    setSort,
    userLocation,
    autoLocationLabel,
    setAutoLocationLabel,
    accessibilityAttrs,
    setAccessibilityAttrs,
    targetGroupsFilter,
    setTargetGroupsFilter,
    languages,
    setLanguages,
    ageRestriction,
    setAgeRestriction,
    setTimelineViewport,
    // option sources
    accAttrOptions,
    tgOptions,
    // derived
    hasActiveFilters,
    sheetFilterCount,
    // handlers
    request,
    commitSearch,
    handlePresetSelect,
    clearFilters,
  };
}
