/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DayCard, getPlaceSlot, autoTheme, isDayToday } from '../DayCard';
import type { TripDay, TripPlace } from '@/hooks/useTrips';

vi.mock('@/hooks/useTripSuggestions', () => ({
  fetchTripMapVenues: vi.fn(async () => []),
  fetchTripMapEvents: vi.fn(async () => []),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, d?: string | Record<string, unknown>) =>
      typeof d === 'string' ? d : k,
  }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: 'vertical',
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('../TripMap', () => ({
  TripMap: () => <div data-testid="trip-map-stub" />,
}));

vi.mock('../PlaceBookableLinks', () => ({
  PlaceBookableLinks: () => null,
}));

vi.mock('../SortablePlaceCard', () => ({
  SortablePlaceCard: ({ place }: { place: { id: string } }) => (
    <div data-testid={`place-${place.id}`}>{place.id}</div>
  ),
  PlaceCardOverlay: () => null,
  getPlaceName: () => '',
  getPlaceCategory: () => 'custom',
}));

function place(overrides: Partial<TripPlace> = {}): TripPlace {
  return {
    id: 'p1',
    trip_id: 't1',
    day_id: 'd1',
    venue_id: null,
    event_id: null,
    hotel_id: null,
    custom_name: 'Custom',
    custom_address: null,
    latitude: null,
    longitude: null,
    city_id: null,
    country_id: null,
    start_time: null,
    end_time: null,
    duration_minutes: null,
    notes: null,
    category: null,
    sort_order: 0,
    created_by: null,
    created_at: '2026-01-01',
    ...overrides,
  };
}

describe('getPlaceSlot', () => {
  it('returns unscheduled when no start_time', () => {
    expect(getPlaceSlot(place())).toBe('unscheduled');
  });
  it('classifies morning (< 12)', () => {
    expect(getPlaceSlot(place({ start_time: '09:00' }))).toBe('morning');
  });
  it('classifies afternoon (12-16)', () => {
    expect(getPlaceSlot(place({ start_time: '14:30' }))).toBe('afternoon');
  });
  it('classifies evening (17-21)', () => {
    expect(getPlaceSlot(place({ start_time: '19:00' }))).toBe('evening');
  });
  it('classifies night (22+)', () => {
    expect(getPlaceSlot(place({ start_time: '23:00' }))).toBe('night');
  });
});

describe('autoTheme', () => {
  it('detects pride from event title', () => {
    expect(
      autoTheme({
        isFirst: false,
        isLast: false,
        places: [
          place({
            event_id: 'e1',
            events: {
              id: 'e1',
              title: 'Lisbon Pride Parade',
              event_type: null,
              start_date: null,
              end_date: null,
              images: null,
            },
          }),
        ],
      }),
    ).toBe('Pride day');
  });

  it('labels first day as Arrival', () => {
    expect(autoTheme({ isFirst: true, isLast: false, places: [] })).toBe(
      'Arrival day',
    );
  });

  it('labels last day as Departure', () => {
    expect(autoTheme({ isFirst: false, isLast: true, places: [] })).toBe(
      'Departure day',
    );
  });

  it('returns null when nothing distinctive', () => {
    expect(autoTheme({ isFirst: false, isLast: false, places: [] })).toBeNull();
  });
});

describe('isDayToday', () => {
  it('returns true for same calendar day', () => {
    const now = new Date('2026-05-16T15:00:00Z');
    expect(isDayToday('2026-05-16', now)).toBe(true);
  });
  it('returns false for different day', () => {
    const now = new Date('2026-05-16T15:00:00Z');
    expect(isDayToday('2026-05-15', now)).toBe(false);
  });
});

describe('DayCard render', () => {
  const day: TripDay = {
    id: 'd1',
    trip_id: 't1',
    date: '2030-01-01',
    title: null,
    notes: null,
    sort_order: 0,
  };

  const noop = () => {};

  it('renders without crashing with empty places', () => {
    const { container, getByText } = render(
      <DayCard
        day={day}
        dayNumber={1}
        totalDays={3}
        isFirst
        isLast={false}
        isToday={false}
        isPast={false}
        isFuture
        places={[]}
        editingTitle={false}
        draftTitle=""
        activeDragId={null}
        onStartEditTitle={noop}
        onChangeDraftTitle={noop}
        onSaveTitle={noop}
        onCancelEditTitle={noop}
        onAddPlace={noop}
        onDeletePlace={noop}
      />,
    );
    expect(container.querySelector('[data-day-id="d1"]')).toBeTruthy();
    // Auto theme should appear ("Arrival day" since isFirst)
    expect(getByText('Arrival day')).toBeTruthy();
  });

  it('marks today via data attribute', () => {
    const { container } = render(
      <DayCard
        day={day}
        dayNumber={1}
        totalDays={3}
        isFirst
        isLast={false}
        isToday
        isPast={false}
        isFuture={false}
        places={[]}
        editingTitle={false}
        draftTitle=""
        activeDragId={null}
        onStartEditTitle={noop}
        onChangeDraftTitle={noop}
        onSaveTitle={noop}
        onCancelEditTitle={noop}
        onAddPlace={noop}
        onDeletePlace={noop}
      />,
    );
    expect(
      container.querySelector('[data-day-today="true"]'),
    ).toBeTruthy();
  });

  it('groups places by time slot', () => {
    const places = [
      place({ id: 'a', start_time: '09:00' }),
      place({ id: 'b', start_time: '19:00' }),
    ];
    const { getByText } = render(
      <DayCard
        day={day}
        dayNumber={1}
        totalDays={3}
        isFirst={false}
        isLast={false}
        isToday={false}
        isPast={false}
        isFuture
        places={places}
        editingTitle={false}
        draftTitle=""
        activeDragId={null}
        onStartEditTitle={noop}
        onChangeDraftTitle={noop}
        onSaveTitle={noop}
        onCancelEditTitle={noop}
        onAddPlace={noop}
        onDeletePlace={noop}
      />,
    );
    expect(getByText('Morning')).toBeTruthy();
    expect(getByText('Evening')).toBeTruthy();
  });
});
