import { lazy, Suspense, useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { EventsHeroSpotlight } from '@/components/events/EventsHeroSpotlight';
import { SmartEmptyState } from '@/components/events/SmartEmptyState';
import { PresetChips } from '@/components/events/PresetChips';
import { useEvents } from '@/hooks/useEvents';
import { useEventFilters } from '@/hooks/useEventFilters';
import { useMeta } from '@/hooks/useMeta';
import { EventCard } from '@/components/events/EventCard';
import { EventsTimelineView } from '@/components/events/EventsTimelineView';
// Lazy: keeps the maplibre chunk off the default grid/timeline views
const EventsMapView = lazy(() =>
  import('@/components/events/EventsMapView').then((m) => ({ default: m.EventsMapView }))
);
import { Button } from '@/components/ui/button';
import { PageHero } from '@/components/discovery';
import { EventGuidesStream } from '@/components/events/EventGuidesStream';
import { EmptyState, LoadingTimeout, ErrorState } from '@/components/ui/EmptyState';
import { Calendar } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { EventActiveFilters } from '@/components/events/EventActiveFilters';
import { EventSearchBar } from '@/components/events/EventSearchBar';
import { EventFiltersPanel } from '@/components/events/EventFiltersPanel';
import { EventsResultBar } from '@/components/events/EventsResultBar';
import { EventGridView } from '@/components/events/EventGridView';

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
      <div className="container mx-auto px-4 py-8 md:py-12">
        <EventGuidesStream limit={6} />
        {/* Filters — first interactive surface after hero */}
        <div className="flex flex-col gap-4 p-4 bg-card rounded-container mb-6">
          {/* Search Bar */}
          <EventSearchBar
            search={f.search}
            onSearchChange={f.setSearch}
            onSearch={f.handleFiltersChange}
            showFilters={f.showFilters}
            onToggleFilters={() => f.setShowFilters(!f.showFilters)}
          />

          {/* Smart entry chips — preset filter combos */}
          <PresetChips active={f.activePreset} onSelect={f.handlePresetSelect} />

          {/* Extended Filters */}
          {f.showFilters && (
            <EventFiltersPanel
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
          )}

          {/* Active Filters Display */}
          {f.hasActiveFilters && !f.showFilters && (
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
          )}
        </div>

        {/* Editor-curated spotlight — only when browsing unfiltered */}
        {!f.hasActiveFilters && (
          <div className="mb-6">
            <EventsHeroSpotlight />
          </div>
        )}

        {/* Result-meta row: count + view toggle + sort + past toggle */}
        {!loading && !error && (
          <EventsResultBar
            eventsCount={events.length}
            totalCount={totalCount}
            autoLocationLabel={f.autoLocationLabel}
            cities={f.cities}
            onShowWorldwide={() => {
              f.setCities([]);
              f.setAutoLocationLabel(null);
            }}
            showPast={f.showPast}
            onToggleShowPast={() => f.setShowPast(!f.showPast)}
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
      </div>
    </div>
  );
};
export default Events;
