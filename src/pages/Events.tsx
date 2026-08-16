import { lazy, Suspense, useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { EventsHeroSpotlight } from '@/components/events/EventsHeroSpotlight';
import { SmartEmptyState } from '@/components/events/SmartEmptyState';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { useEventWindowCounts } from '@/hooks/useEventWindowCounts';
import { useEvents } from '@/hooks/useEvents';
import { useEventFilters } from '@/hooks/useEventFilters';
import { useMeta } from '@/hooks/useMeta';
import { EventCard } from '@/components/events/EventCard';
import { EventsTimelineView } from '@/components/events/EventsTimelineView';
// Lazy: keeps the maplibre chunk off the default grid/timeline views
const EventsMapView = lazy(() =>
  import('@/components/events/EventsMapView').then((m) => ({ default: m.EventsMapView })),
);
import { Button } from '@/components/ui/button';
import { PageHero } from '@/components/discovery';
import { GuidesRail } from '@/components/guides/GuidesRail';
import { EmptyState, LoadingTimeout, ErrorState } from '@/components/ui/EmptyState';
import { Calendar } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { EventActiveFilters } from '@/components/events/EventActiveFilters';
import { EventsControlBar } from '@/components/events/EventsControlBar';
import { EventsFilterSheet } from '@/components/events/EventsFilterSheet';
import { EventsResultHeader } from '@/components/events/EventsResultHeader';
import { EventGridView } from '@/components/events/EventGridView';
import { PageContainer, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';

type Event = Database['public']['Tables']['events']['Row'];

const Events = () => {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const {
    events,
    loading,
    error,
    hasMore,
    datasetTotal,
    totalCount,
    fetchEvents,
    updateAttendance,
    loadingTimedOut,
  } = useEvents(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useMeta({
    title: 'Events',
    description: 'LGBTQ+ community events — parties, meetups, pride marches, workshops, and more.',
    canonicalPath: '/events',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'LGBTQ+ Events',
      description: 'LGBTQ+ community events worldwide.',
      url: 'https://queer.guide/events',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  const f = useEventFilters(fetchEvents, events);
  const { PAGE_SIZE } = f;

  // Scoped to the city filter when exactly one is selected, so the chip counts
  // describe the set the reader is actually looking at rather than the globe.
  const { data: windowCounts } = useEventWindowCounts(f.cities.length === 1 ? f.cities[0] : null);

  const [_selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const handleAttendanceUpdate = async (
    eventId: string,
    status: 'going' | 'interested' | 'not_going',
  ) => {
    if (!user) {
      toast({
        title: t('pages.events.signInRequired', 'Sign in required'),
        description: t('pages.events.signInRsvp', 'Please sign in to RSVP to events.'),
        variant: 'destructive',
      });
      return;
    }
    const { error } = await updateAttendance(eventId, status);
    if (error) {
      toast({
        title: 'Error',
        description: error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: t('pages.events.rsvpUpdated', 'RSVP Updated'),
        description: `You're now marked as ${status} for this event.`,
      });
      fetchEvents(
        {},
        {
          page: 1,
          pageSize: PAGE_SIZE,
          append: false,
        },
      ); // Refresh to show updated attendance
    }
  };
  const handleViewDetails = (event: Event) => {
    setSelectedEvent(event);
  };

  return (
    <div className="min-h-screen">
      <PageHero
        title={t('pages.events.title', 'Events.')}
        lede={t('pages.events.subtitle', 'Community events in your area')}
        primaryCta={{ label: t('pages.events.submitEvent', 'Add an event'), href: '/submit' }}
        size="md"
      />
      {/* ---- Control band ---------------------------------------------------
       *
       *  ONE band, full-bleed and sticky, holding everything that was previously
       *  a 352px `bg-card` filter block PLUS a 175px sticky result bar stacked
       *  under it. Same shape /cities and /marketplace already use.
       *
       *  It renders unconditionally — the old result bar was gated on
       *  `!loading && !error`, so the search field and every control vanished
       *  during a refetch and the page jumped by the bar's height each time. */}
      <div
        className={cn(
          'sticky z-20 border-b-[3px] border-foreground bg-background',
          STICKY_UNDER_HEADER,
        )}
      >
        <PageContainer flush className="py-2 md:py-4">
          <EventsControlBar
            search={f.search}
            onSearchChange={f.setSearch}
            onSearchSubmit={f.handleFiltersChange}
            activePreset={f.activePreset}
            /* Counts are passed so a window that would return nothing is
               disabled and labelled rather than left as a clickable promise;
               see the note in useEventWindowCounts. */
            onPresetSelect={f.handlePresetSelect}
            presetCounts={windowCounts}
            showPast={f.showPast}
            onToggleShowPast={() => f.setShowPast(!f.showPast)}
            sheetFilterCount={f.sheetFilterCount}
            onOpenFilters={() => f.setShowFilters(true)}
            filtersOpen={f.showFilters}
          />
        </PageContainer>
      </div>

      <EventsFilterSheet
        open={f.showFilters}
        onOpenChange={f.setShowFilters}
        resultCount={totalCount ?? events.length}
        availableCities={f.availableCities}
        cities={f.cities}
        setCities={f.setCities}
        eventTypes={f.eventTypes}
        setEventTypes={f.setEventTypes}
        startDate={f.startDate}
        setStartDate={f.setStartDate}
        endDate={f.endDate}
        setEndDate={f.setEndDate}
        selectedTags={f.selectedTags}
        setSelectedTags={f.setSelectedTags}
        accAttrOptions={f.accAttrOptions}
        accessibilityAttrs={f.accessibilityAttrs}
        setAccessibilityAttrs={f.setAccessibilityAttrs}
        tgOptions={f.tgOptions}
        targetGroupsFilter={f.targetGroupsFilter}
        setTargetGroupsFilter={f.setTargetGroupsFilter}
        languages={f.languages}
        setLanguages={f.setLanguages}
        ageRestriction={f.ageRestriction}
        setAgeRestriction={f.setAgeRestriction}
        hasActiveFilters={f.hasActiveFilters}
        onApply={f.handleFiltersChange}
        onClear={f.clearFilters}
      />

      <PageContainer>
        {/* Active filters sit BELOW the band, not inside it. They are unbounded
            — one chip per set dimension — and everything in the band above is
            paid for on every screen of results for the whole session. */}
        {f.hasActiveFilters && (
          <div className="mb-4">
            <EventActiveFilters
              search={f.search}
              cities={f.cities}
              eventTypes={f.eventTypes}
              startDate={f.startDate}
              endDate={f.endDate}
              nearMe={f.nearMe}
              showPast={f.showPast}
              isFree={f.isFree}
              featuredOnly={f.featuredOnly}
              ageRestriction={f.ageRestriction}
              selectedTags={f.selectedTags}
              autoLocationLabel={f.autoLocationLabel}
              activePreset={f.activePreset}
              setSearch={f.setSearch}
              setCities={f.setCities}
              setAutoLocationLabel={f.setAutoLocationLabel}
              setEventTypes={f.setEventTypes}
              setStartDate={f.setStartDate}
              setEndDate={f.setEndDate}
              setNearMe={f.setNearMe}
              setShowPast={f.setShowPast}
              setIsFree={f.setIsFree}
              setFeaturedOnly={f.setFeaturedOnly}
              setActivePreset={f.setActivePreset}
              setAgeRestriction={f.setAgeRestriction}
              setSelectedTags={f.setSelectedTags}
            />
          </div>
        )}

        {/* Editor-curated spotlight — only when browsing unfiltered */}
        {!f.hasActiveFilters && (
          <div className="mb-6">
            <EventsHeroSpotlight />
          </div>
        )}

        {/* Coverage honesty — sits directly above the results, where it does its
            work: it is the difference between "the scene is dead" and "we have
            no listings". Kept out of the sticky band on purpose; it is prose,
            and prose in a sticky bar is paid for on every screen. */}
        {typeof windowCounts?.upcoming === 'number' ? (
          <CoverageNote>
            {windowCounts.upcoming === 0
              ? 'We have no upcoming events listed. That means we have no record — not that nothing is happening.'
              : `${windowCounts.upcoming.toLocaleString()} upcoming events listed${
                  typeof windowCounts['next-7-days'] === 'number'
                    ? `, ${windowCounts['next-7-days']} of them in the next 7 days`
                    : ''
                }. Listings come from organisers and submissions, so a quiet week here is a gap in our coverage rather than a quiet scene.`}
          </CoverageNote>
        ) : null}

        {/* Count + sort + view mode. Was a sticky 175px bar; see the note in
            EventsResultHeader for why none of the three earns that. */}
        {!error && (
          <EventsResultHeader
            eventsCount={events.length}
            totalCount={totalCount}
            autoLocationLabel={f.autoLocationLabel}
            cities={f.cities}
            onShowWorldwide={() => {
              f.setCities([]);
              f.setAutoLocationLabel(null);
            }}
            sort={f.sort}
            onSortChange={f.setSort}
            userLocation={f.userLocation}
            nearMe={f.nearMe}
            viewMode={f.viewMode}
            onViewModeChange={f.setViewMode}
          />
        )}

        {/* Status region for screen readers */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {loading ? 'Loading events...' : error ? error : `${events.length} events found`}
        </div>

        {/* Error State */}
        {error && !loading && <ErrorState message={error} onRetry={() => fetchEvents()} />}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <EventCard key={i} loading />
            ))}
          </div>
        )}
        {loading && loadingTimedOut && <LoadingTimeout onRetry={() => fetchEvents()} />}

        {/* Empty State */}
        {!loading &&
          !error &&
          events.length === 0 &&
          (datasetTotal === 0 || (datasetTotal === null && !f.hasActiveFilters) ? (
            <EmptyState
              icon={Calendar}
              variant="empty"
              title={t('pages.events.emptyDataset.title', 'No events yet')}
              description={t(
                'pages.events.emptyDataset.body',
                "We haven't added any events here yet. Help us grow the guide by submitting one.",
              )}
              primaryAction={{
                label: t('pages.events.submitAnEvent', 'Submit an Event'),
                onClick: () => navigate('/submit/event'),
              }}
            />
          ) : f.showPast ? (
            <EmptyState
              icon={Calendar}
              variant="filtered"
              title={t('pages.events.noPastEvents', 'No past events found')}
              description={t(
                'pages.events.noPastEventsDesc',
                'No past events match these filters. Turn off the toggle to see upcoming events.',
              )}
              primaryAction={{
                label: t('pages.events.submitAnEvent', 'Submit an Event'),
                onClick: () => navigate('/submit/event'),
              }}
              secondaryAction={
                f.hasActiveFilters
                  ? {
                      label: t('pages.events.clearFiltersLabel', 'Clear Filters'),
                      onClick: f.clearFilters,
                      variant: 'outline',
                    }
                  : undefined
              }
            />
          ) : (
            <SmartEmptyState
              city={f.cities[0] || undefined}
              dateRange={
                f.startDate && f.endDate
                  ? { start: f.startDate.toISOString(), end: f.endDate.toISOString() }
                  : undefined
              }
              hasActiveFilters={!!f.hasActiveFilters}
              onClearFilters={f.clearFilters}
              onClearCity={
                f.cities.length > 0
                  ? () => {
                      f.setCities([]);
                      f.setAutoLocationLabel(null);
                    }
                  : undefined
              }
              onClearDate={
                f.startDate || f.endDate
                  ? () => {
                      f.setStartDate(undefined);
                      f.setEndDate(undefined);
                      f.handleFiltersChange();
                    }
                  : undefined
              }
            />
          ))}

        {/* Event Content */}
        {!loading && events.length > 0 && f.viewMode === 'grid' && (
          <EventGridView
            events={events}
            onViewDetails={handleViewDetails}
            onUpdateAttendance={user ? handleAttendanceUpdate : undefined}
          />
        )}
        {f.viewMode === 'timeline' && (
          <EventsTimelineView
            events={events}
            onEventSelect={handleViewDetails}
            onViewportChange={f.setTimelineViewport}
            loading={loading}
            onRsvp={user ? handleAttendanceUpdate : undefined}
            enableSaveToTrip={!!user}
          />
        )}
        {!loading && events.length > 0 && f.viewMode === 'map' && (
          <Suspense
            fallback={<div className="h-[640px] w-full rounded-container bg-muted animate-pulse" />}
          >
            <EventsMapView events={events} height={640} />
          </Suspense>
        )}

        {/* Load More */}
        {!loading && events.length > 0 && (
          <div className="text-center mt-12">
            {hasMore && f.autoLoadedCount >= 50 && (
              <Button
                variant="outline"
                size="lg"
                onClick={async () => {
                  f.setAutoLoadedCount(0);
                  const nextPage = f.page + 1;
                  f.setPage(nextPage);
                  await fetchEvents(
                    {},
                    {
                      page: nextPage,
                      pageSize: PAGE_SIZE,
                      append: true,
                    },
                  );
                }}
              >
                Load More Events
              </Button>
            )}
          </div>
        )}

        {/* Editorial cross-links go AFTER the events, not before them.
         *
         *  This rail used to sit between the hero and the filters — the comment
         *  above the filter block still called that block "first interactive
         *  surface after hero", which had not been true for some time. Measured
         *  on prod at 390x844: the rail was 527px, and the first event card sat
         *  1,789px down — 2.12 viewport heights of hero, guides, filters and
         *  result header before a single event. On a page whose entire job is
         *  events, editorial about events outranked the events.
         *
         *  Same placement `/cities` uses for its tail cards. */}
        <GuidesRail filters={{ entityType: 'event', limit: 6 }} />
      </PageContainer>
    </div>
  );
};
export default Events;
