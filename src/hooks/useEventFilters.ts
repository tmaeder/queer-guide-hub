import { useState, useEffect, useRef, useMemo } from 'react';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { useAccessibilityAttributes } from '@/hooks/useAccessibilityAttributes';
import { useTargetGroups } from '@/hooks/useTargetGroups';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useDebounce } from '@/hooks/useDebounce';
import { getPresetDateRange, type EventPresetId } from '@/components/events/PresetChips';
import { dedupeCitiesByNormalized } from '@/utils/dateRange';
import {
  parseFilterState,
  serializeFilterState,
  type EventSort,
} from '@/utils/eventsQueryString';
import type { useEvents } from '@/hooks/useEvents';

type EventsApi = ReturnType<typeof useEvents>;

const PAGE_SIZE = 24;

/**
 * Owns the entire Events-page filter state machine: 18 filter dimensions,
 * preset toggle-reversal logic, geolocation/near-me, URL serialize/hydrate,
 * the debounced timeline-viewport refetch, and all the mount-guarded
 * re-fetch effects. Extracted verbatim from Events.tsx — behavior-preserving.
 *
 * `fetchEvents` and `events` are injected from the page's useEvents() instance
 * so the data layer stays owned by the page.
 */
export function useEventFilters(fetchEvents: EventsApi['fetchEvents'], events: EventsApi['events']) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline' | 'map'>('grid');

  // Filter states
  const [search, setSearch] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [nearMe, setNearMe] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [isFree, setIsFree] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [activePreset, setActivePreset] = useState<EventPresetId | null>(null);
  const [sort, setSort] = useState<EventSort>('date-asc');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [autoLocationLabel, setAutoLocationLabel] = useState<string | null>(null);
  const { location: visitorLocation } = useVisitorLocation();
  const [page, setPage] = useState(1);
  const [autoLoadedCount, setAutoLoadedCount] = useState(0);
  // New filter dimensions (Phase B.2 + B.4)
  const [accessibilityAttrs, setAccessibilityAttrs] = useState<string[]>([]);
  const [targetGroupsFilter, setTargetGroupsFilter] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [ageRestriction, setAgeRestriction] = useState<string>('');
  const { accessibilityAttributes: accAttrOptions } = useAccessibilityAttributes();
  const { targetGroups: tgOptions } = useTargetGroups();

  // Timeline viewport drives a parallel date-range fetch when timeline view is active.
  const [timelineViewport, setTimelineViewport] = useState<{ startMs: number; endMs: number } | null>(null);
  const debouncedViewport = useDebounce(timelineViewport, 350);

  // Get unique cities from events for auto-suggest
  const availableCities = useMemo(
    () => dedupeCitiesByNormalized(events.map((event) => event.city).filter(Boolean) as string[]),
    [events],
  );

  const handleFiltersChange = async () => {
    const dateRange =
      startDate && endDate
        ? {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          }
        : undefined;
    const filters = {
      search: search || undefined,
      cities: cities.length > 0 ? cities : undefined,
      eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      accessibilityAttributes: accessibilityAttrs.length > 0 ? accessibilityAttrs : undefined,
      targetGroups: targetGroupsFilter.length > 0 ? targetGroupsFilter : undefined,
      languages: languages.length > 0 ? languages : undefined,
      ageRestriction: ageRestriction || undefined,
      dateRange,
      nearMe: nearMe ? userLocation : undefined,
      includePast: showPast || undefined,
      featured: featuredOnly || undefined,
      isFree: isFree || undefined,
      sort,
    };
    setPage(1);
    setAutoLoadedCount(0);
    await fetchEvents(filters, {
      page: 1,
      pageSize: PAGE_SIZE,
      append: false,
    });
  };
  // D6 follow-up: handlePresetSelect both calls fetchEvents() and mutates
  // filter state that the `otherFiltersMounted` useEffect listens to. Without
  // this skip flag we'd fire two fetches per preset toggle. The flag is set
  // before the state batch and the useEffect drops one tick when it sees it.
  const suppressFilterRefetch = useRef(false);

  const handlePresetSelect = async (preset: EventPresetId | null) => {
    // D6: toggling a preset OFF must fully reverse every state it set.
    // Previously eventType='pride' leaked after un-toggling Pride, and
    // isFree/featuredOnly were always cleared on every press (even when
    // activating a different preset that shouldn't touch them).
    suppressFilterRefetch.current = true;
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
      setPage(1);
      setAutoLoadedCount(0);
      await fetchEvents(
        {
          search: search || undefined,
          cities: cities.length > 0 ? cities : undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          includePast: showPast || undefined,
          sort,
        },
        { page: 1, pageSize: PAGE_SIZE, append: false },
      );
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
    setPage(1);
    setAutoLoadedCount(0);
    await fetchEvents(
      {
        search: search || undefined,
        cities: cities.length > 0 ? cities : undefined,
        eventTypes:
          preset === 'pride' ? ['pride'] : eventTypes.length > 0 ? eventTypes : undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        dateRange: range
          ? { start: range.start.toISOString(), end: range.end.toISOString() }
          : undefined,
        featured: preset === 'featured' || undefined,
        isFree: preset === 'free' || undefined,
        includePast: showPast || undefined,
        sort,
      },
      { page: 1, pageSize: PAGE_SIZE, append: false },
    );
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

        // Fetch events near user
        fetchEvents({
          search: search || undefined,
          eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          nearMe: location,
          includePast: showPast || undefined,
        });
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
      handleFiltersChange();
    }
  };

  const clearFilters = async () => {
    setSearch('');
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
    setPage(1);
    setAutoLoadedCount(0);
    await fetchEvents(
      {},
      {
        page: 1,
        pageSize: PAGE_SIZE,
        append: false,
      },
    );
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

  const autoInitDone = useRef(false);
  useEffect(() => {
    if (autoInitDone.current) return;
    autoInitDone.current = true;
    setPage(1);
    setAutoLoadedCount(0);
    const cityName = visitorLocation?.city;
    if (cityName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setCities([cityName]);
      setAutoLocationLabel(cityName);
      fetchEvents({ cities: [cityName] }, { page: 1, pageSize: PAGE_SIZE, append: false });
    } else {
      fetchEvents({}, { page: 1, pageSize: PAGE_SIZE, append: false });
    }
    // run once on mount; visitorLocation may not yet be available but that is fine — user can still see all events
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when the past-events toggle changes
  const showPastMounted = useRef(false);
  useEffect(() => {
    if (!showPastMounted.current) {
      showPastMounted.current = true;
      return;
    }
    handleFiltersChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPast]);

  // Reactive city filter — fire as soon as a value is picked from the
  // combobox. Avoids the "user picks London but list doesn't update" trap.
  const cityMounted = useRef(false);
  useEffect(() => {
    if (!cityMounted.current) {
      cityMounted.current = true;
      return;
    }
    handleFiltersChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities]);

  // Re-fetch when sort changes
  const sortMounted = useRef(false);
  useEffect(() => {
    if (!sortMounted.current) {
      sortMounted.current = true;
      return;
    }
    handleFiltersChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  // D6: re-fetch when any of the remaining filter dimensions change.
  // Pill `×` handlers call setX() but did not trigger a refetch on their
  // own; this guard mirrors the existing cityMounted / sortMounted pattern.
  // suppressFilterRefetch is set by handlePresetSelect to avoid double
  // fetches when the preset handler already issued one.
  const otherFiltersMounted = useRef(false);
  useEffect(() => {
    if (!otherFiltersMounted.current) {
      otherFiltersMounted.current = true;
      return;
    }
    if (suppressFilterRefetch.current) {
      suppressFilterRefetch.current = false;
      return;
    }
    handleFiltersChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTypes, startDate, endDate, isFree, featuredOnly, nearMe, selectedTags, accessibilityAttrs, targetGroupsFilter, languages, ageRestriction]);

  // Debounced search — apply ~300ms after the user stops typing so the
  // list filters live. Enter still flushes immediately via onKeyDown.
  const debouncedSearch = useDebounce(search, 300);
  const searchMounted = useRef(false);
  useEffect(() => {
    if (!searchMounted.current) {
      searchMounted.current = true;
      return;
    }
    handleFiltersChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Full filter-state URL sync (shareable, refreshable, bookmarkable).
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Hydrate filters from URL on first mount.
  useEffect(() => {
    const parsed = parseFilterState(searchParams);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    if (parsed.cities.length) setCities(parsed.cities);
    if (parsed.q) setSearch(parsed.q);
    if (parsed.types.length) setEventTypes(parsed.types);
    if (parsed.tags.length) setSelectedTags(parsed.tags);
    if (parsed.accessibility.length) setAccessibilityAttrs(parsed.accessibility);
    if (parsed.languages.length) setLanguages(parsed.languages);
    if (parsed.ageRestriction) setAgeRestriction(parsed.ageRestriction);
    if (parsed.from) setStartDate(new Date(parsed.from));
    if (parsed.to) setEndDate(new Date(parsed.to));
    if (parsed.nearMe) setNearMe(true);
    if (parsed.showPast) setShowPast(true);
    if (parsed.isFree) setIsFree(true);
    if (parsed.featured) setFeaturedOnly(true);
    if (parsed.sort !== 'date-asc') setSort(parsed.sort);
    if (parsed.view !== 'grid') setViewMode(parsed.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timeline viewport → date-range refetch (debounced). Only active when
  // the timeline view is selected so we don't interfere with grid/map.
  const lastFetchedViewportRef = useRef<string | null>(null);
  useEffect(() => {
    if (viewMode !== 'timeline' || !debouncedViewport) return;
    const key = `${debouncedViewport.startMs}-${debouncedViewport.endMs}`;
    if (lastFetchedViewportRef.current === key) return;
    lastFetchedViewportRef.current = key;
    const startIso = new Date(debouncedViewport.startMs).toISOString();
    const endIso = new Date(debouncedViewport.endMs).toISOString();
    const includePast = debouncedViewport.startMs < Date.now();
    fetchEvents(
      {
        search: search || undefined,
        cities: cities.length > 0 ? cities : undefined,
        eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        dateRange: { start: startIso, end: endIso },
        nearMe: nearMe ? userLocation : undefined,
        includePast: includePast || showPast || undefined,
        featured: featuredOnly || undefined,
        isFree: isFree || undefined,
        sort,
      },
      { page: 1, pageSize: PAGE_SIZE, append: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedViewport, viewMode]);

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
    page,
    setPage,
    autoLoadedCount,
    setAutoLoadedCount,
    setTimelineViewport,
    // option sources
    accAttrOptions,
    tgOptions,
    availableCities,
    // derived
    hasActiveFilters,
    // handlers
    handleFiltersChange,
    handlePresetSelect,
    clearFilters,
  };
}
