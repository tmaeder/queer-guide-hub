/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

// The parts barrel reaches maplibre through EntityMap, whose worker URL vitest
// refuses to resolve. Nothing here exercises the map.
vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => <div data-testid="map" /> }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));

vi.mock('@/components/trips/TripAction', () => ({
  TripAction: () => <button>Add to a trip</button>,
}));

import {
  EventDecisionCard,
  hasEventAboutContent,
  hasEventWhereContent,
  formatEventDate,
  getPriceDisplay,
  eventStatusLabel,
  EventMasthead,
  EventActions,
  type EventWithRelations,
} from '../EventDetail.parts';

const event = {
  id: 'e1',
  slug: 'pride-march',
  title: 'Pride March',
  start_date: '2026-06-27T12:00:00Z',
  end_date: null,
  cities: { id: 'c1', slug: 'berlin', name: 'Berlin' },
  countries: { id: 'co1', slug: 'germany', name: 'Germany' },
} as unknown as EventWithRelations;

describe('EventDetail.parts helpers', () => {
  it('formatEventDate returns string', () => {
    expect(typeof formatEventDate('2026-05-15T00:00:00Z')).toBe('string');
  });

  it('getPriceDisplay returns value', () => {
    expect(getPriceDisplay({ price_min: 0, price_max: 0 } as never)).toBeDefined();
  });

  it('eventStatusLabel is undefined for an ordinary event', () => {
    // The status chip is a bordered ink outline in `DetailMasthead`, so an
    // event with nothing to say must return undefined rather than an empty
    // string — an empty chip is still a chip.
    //
    // The date is far-future ON PURPOSE and must stay that way. This assertion
    // used the shared `event` fixture dated 2026-06-27, which was upcoming
    // when it was written and quietly became a PAST event on the calendar —
    // so once past events started reporting "Ended", the test failed on a
    // correct implementation. A fixture that encodes "upcoming" as a literal
    // date stops meaning that the moment the date passes.
    expect(
      eventStatusLabel({ ...event, start_date: '2999-01-01T00:00:00Z' } as never),
    ).toBeUndefined();
  });

  it('eventStatusLabel says Ended once the event is over', () => {
    expect(eventStatusLabel({ ...event, start_date: '2020-01-01T00:00:00Z' } as never)).toBe(
      'Ended',
    );
  });

  it('eventStatusLabel names a cancelled event', () => {
    expect(eventStatusLabel({ ...event, status: 'cancelled' } as never)).toBeTruthy();
  });
});

describe('EventMasthead', () => {
  it('links the venue, city and country it actually has', () => {
    renderWithProviders(
      <EventMasthead
        event={event}
        cityName="Berlin"
        countryName="Germany"
        cityLink="/city/berlin"
        countryLink="/country/germany"
      />,
    );
    expect(screen.getByRole('link', { name: 'Berlin' })).toHaveAttribute('href', '/city/berlin');
    expect(screen.getByRole('link', { name: 'Germany' })).toHaveAttribute(
      'href',
      '/country/germany',
    );
  });

  it('carries no <h1> — DetailMasthead owns the heading', () => {
    // `e2e/a11y-event-detail.spec.ts` asserts exactly one h1 on the page. The
    // hero this replaced rendered its own, so leaving one here would make two.
    const { container } = renderWithProviders(
      <EventMasthead
        event={event}
        cityName="Berlin"
        countryName="Germany"
        cityLink={null}
        countryLink={null}
      />,
    );
    expect(container.querySelector('h1')).toBeNull();
  });

  it('renders no photograph', () => {
    // The 380px hero bed became `PhotoInset` in the body.
    const { container } = renderWithProviders(
      <EventMasthead
        event={event}
        cityName={null}
        countryName={null}
        cityLink={null}
        countryLink={null}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('Event action consolidation', () => {
  const upcoming = {
    ...event,
    start_date: '2999-01-01T00:00:00Z',
    ticket_url: 'https://tickets.example/x',
  };
  const props = {
    user: null,
    isPast: false,
    userAttendance: null,
    onAttendanceUpdate: vi.fn(),
    onExportToCalendar: vi.fn(),
    onSendEvent: vi.fn(),
  };

  it('offers one ticket action and does not repeat timing or price facts', () => {
    renderWithProviders(<EventDecisionCard {...props} event={upcoming as never} />);
    expect(screen.getAllByRole('link', { name: /tickets/i })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /tickets/i })).toHaveAttribute(
      'href',
      upcoming.ticket_url,
    );
    expect(screen.queryByText('Price TBA')).toBeNull();
    expect(screen.queryByText(/2999/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to a trip' })).toBeInTheDocument();
  });

  it('keeps reference and calendar tools but removes attendance and purchasing on past events', () => {
    renderWithProviders(
      <EventDecisionCard
        {...props}
        isPast
        event={{ ...upcoming, website: 'https://example.org/pride' } as never}
      />,
    );
    expect(screen.queryByRole('link', { name: /tickets/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to a trip' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Going' })).toBeNull();
    fireEvent.click(screen.getByText('More options'));
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(props.onExportToCalendar).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute(
      'href',
      'https://example.org/pride',
    );
  });

  it('preserves RSVP state and toggles going off', () => {
    const onAttendanceUpdate = vi.fn();
    renderWithProviders(
      <EventDecisionCard
        {...props}
        event={upcoming as never}
        user={{ id: 'u1' }}
        userAttendance="going"
        onAttendanceUpdate={onAttendanceUpdate}
      />,
    );
    const going = screen.getByRole('button', { name: 'Going' });
    expect(going).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(going);
    expect(onAttendanceUpdate).toHaveBeenCalledWith('not_going');
    fireEvent.click(screen.getByRole('button', { name: 'Interested' }));
    expect(onAttendanceUpdate).toHaveBeenCalledWith('interested');
  });

  it('keeps the event image accessible through the secondary tools', () => {
    renderWithProviders(
      <EventActions
        event={{ ...upcoming, images: ['https://example.org/event.jpg'] } as never}
        onShare={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('More options'));
    expect(screen.getByRole('link', { name: 'View image' })).toHaveAttribute(
      'href',
      'https://example.org/event.jpg',
    );
  });

  it('groups utilities without introducing another ticket link', () => {
    renderWithProviders(<EventActions event={upcoming as never} onShare={() => {}} />);
    expect(screen.queryByRole('link', { name: /tickets/i })).toBeNull();
    expect(screen.getByText('More options')).toBeInTheDocument();
  });
});

describe('Event section content guards', () => {
  it('omits empty about and location stations on a sparse record', () => {
    expect(hasEventAboutContent(event)).toBe(false);
    expect(hasEventWhereContent(event)).toBe(false);
  });
  it('keeps actual description and venue content without an empty source-only section', () => {
    expect(hasEventAboutContent({ ...event, description: 'A community gathering.' } as never)).toBe(
      true,
    );
    expect(hasEventAboutContent({ ...event, website: 'https://example.org' } as never)).toBe(false);
    expect(hasEventWhereContent({ ...event, venue_name: 'Community Hall' } as never)).toBe(true);
    expect(hasEventWhereContent({ ...event, organizer_name: 'Local collective' } as never)).toBe(
      true,
    );
  });
});
