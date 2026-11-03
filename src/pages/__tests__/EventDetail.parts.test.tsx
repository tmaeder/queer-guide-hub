/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

// The parts barrel reaches maplibre through EntityMap, whose worker URL vitest
// refuses to resolve. Nothing here exercises the map.
vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => <div data-testid="map" /> }));
// Signed-out by default. `signedIn` is switchable because ShareMenu only
// offers "Send to member…" to a signed-in reader, and that entry is the whole
// replacement for the deleted "Send to someone" button — asserting the button
// is gone without asserting the replacement is reachable would pass just as
// happily against a dead `entity` prop, which is the defect being fixed.
let signedIn = false;
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: signedIn ? { id: 'u1' } : null,
    session: null,
    loading: false,
  }),
}));
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));

vi.mock('@/components/trips/TripAction', () => ({
  TripAction: () => <button>Add to a trip</button>,
}));

import {
  EventDecisionCard,
  EventPlanHint,
  EventWhere,
  hasEventAboutContent,
  hasEventWhereContent,
  formatEventDate,
  getPriceDisplay,
  eventStatusLabel,
  EventMasthead,
  EventActions,
  EventFactStrip,
  eventVenueText,
  type EventWithRelations,
  resolveEventCountry,
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

describe('Venue text that only repeats the city', () => {
  // Columbus Pride 2027 on prod: venue_name "Columbus", city Columbus.
  const columbus = {
    ...event,
    venue_name: 'Columbus',
    city: 'Columbus',
    cities: { id: 'c2', slug: 'columbus', name: 'Columbus' },
    countries: { id: 'co2', slug: 'united-states', name: 'United States' },
  } as unknown as EventWithRelations;

  it('eventVenueText drops a venue name equal to the city, keeps a real one', () => {
    expect(eventVenueText(columbus, 'Columbus')).toBeNull();
    expect(eventVenueText({ ...columbus, venue_name: ' columbus ' } as never, null)).toBeNull();
    expect(eventVenueText({ ...columbus, venue_name: 'Goodale Park' } as never, 'Columbus')).toBe(
      'Goodale Park',
    );
  });

  it('the masthead names the city once, not "Columbus, Columbus"', () => {
    const { container } = renderWithProviders(
      <EventMasthead
        event={columbus}
        cityName="Columbus"
        countryName="United States"
        cityLink="/city/columbus"
        countryLink="/country/united-states"
      />,
    );
    expect(container.textContent).toContain('Columbus, United States');
    expect(container.textContent).not.toContain('Columbus, Columbus');
  });
});

describe('Fact strip', () => {
  const strip = (o: Record<string, unknown>) =>
    renderWithProviders(
      <EventFactStrip event={{ ...event, ...o } as never} showEventTz setShowEventTz={() => {}} />,
    );

  it('leaves out Entry when the price is unknown', () => {
    strip({ is_free: false, price_min: null, price_max: null });
    expect(screen.queryByText('Entry')).toBeNull();
    expect(screen.queryByText('Not listed')).toBeNull();
  });

  it('still shows Entry when the event is free', () => {
    strip({ is_free: true });
    expect(screen.getByText('Entry')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
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
      <EventActions event={{ ...upcoming, images: ['https://example.org/event.jpg'] } as never} />,
    );
    fireEvent.click(screen.getByText('More options'));
    expect(screen.getByRole('link', { name: 'View image' })).toHaveAttribute(
      'href',
      'https://example.org/event.jpg',
    );
  });

  it('groups utilities without introducing another ticket link', () => {
    renderWithProviders(<EventActions event={upcoming as never} />);
    expect(screen.queryByRole('link', { name: /tickets/i })).toBeNull();
    expect(screen.getByText('More options')).toBeInTheDocument();
  });

  it('offers exactly one share affordance — no "Send to someone" beside Share', () => {
    renderWithProviders(
      <EventActions event={{ ...upcoming, website: 'https://example.org/pride' } as never} />,
    );
    fireEvent.click(screen.getByText('More options'));
    // Positive control FIRST: the panel is open and populated, so the absence
    // below is a real absence and not an unopened disclosure. It is the
    // website link rather than Mark visited because the latter renders
    // nothing at all for a signed-out reader.
    expect(screen.getByRole('link', { name: /website/i })).toBeInTheDocument();
    expect(screen.queryByText('Send to someone')).toBeNull();
  });

  it('routes sending through ShareMenu, which needs `entity` to offer it', async () => {
    signedIn = true;
    try {
      renderWithProviders(<EventActions event={upcoming as never} />);
      // Radix opens its trigger on pointerdown/keydown, not on a synthetic
      // click — a `fireEvent.click` here leaves the menu closed and the
      // assertion below would fail against perfectly correct code.
      fireEvent.keyDown(screen.getByRole('button', { name: /share/i }), { key: 'Enter' });
      expect(await screen.findByText('Send to member…')).toBeInTheDocument();
    } finally {
      signedIn = false;
    }
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

describe('Event planning information', () => {
  it('gives archived events a next step without a ticket purchase', () => {
    renderWithProviders(<EventPlanHint event={event} isPast />);
    expect(screen.getByRole('link', { name: 'Find your next outing' })).toHaveAttribute(
      'href',
      '/events',
    );
    expect(screen.queryByRole('link', { name: /tickets/i })).toBeNull();
  });
  it('explicitly names missing venue information and links the source', () => {
    renderWithProviders(
      <EventPlanHint
        event={{ ...event, website: 'https://example.org/details' } as never}
        isPast={false}
      />,
    );
    expect(screen.getByText('Venue details aren’t listed here.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check event details' })).toHaveAttribute(
      'href',
      'https://example.org/details',
    );
  });
  it('makes a standalone street address useful without inventing coordinates', () => {
    const addressEvent = { ...event, address: '123 Example Street' } as EventWithRelations;
    expect(hasEventWhereContent(addressEvent)).toBe(true);
    expect(hasEventWhereContent({ ...event, address: '   ' } as never)).toBe(false);
    expect(hasEventWhereContent({ ...event, max_attendees: 40 } as never)).toBe(false);
    renderWithProviders(
      <EventWhere event={addressEvent} venueRef={{ current: null }} onOrganizerClick={() => {}} />,
    );
    expect(screen.getByText('123 Example Street')).toBeInTheDocument();
    const href = screen.getByRole('link', { name: 'Directions' }).getAttribute('href');
    expect(new URL(href!).searchParams.get('destination')).toBe(
      '123 Example Street, Berlin, Germany',
    );
    expect(screen.queryByTestId('map')).toBeNull();
  });
  it('formats the calendar date in the event timezone across a UTC day boundary', () => {
    const date = formatEventDate('2026-01-02T02:00:00Z', '2026-01-02T04:00:00Z', 'America/Toronto');
    expect(date).toContain('January 1, 2026');
    expect(date).not.toContain('January 2');
  });
});

describe('Date-only event calendar days', () => {
  it('preserves imported calendar dates instead of shifting them a day earlier', () => {
    const dates = formatEventDate(
      '2026-08-16T00:00:00Z',
      '2026-08-24T23:59:00Z',
      'America/Toronto',
    );
    expect(dates).toContain('Aug 16, 2026');
    expect(dates).toContain('Aug 24, 2026');
    expect(dates).not.toContain('Aug 15');
  });
});

describe('event country resolution', () => {
  it('keeps France for a Paris event even when a namesake city is linked to Réunion', () => {
    const france = {
      id: 'fr',
      name: 'France',
      slug: 'france',
      equality_score: 90,
      lgbti_criminalization: null,
    };
    const reunion = {
      id: 're',
      name: 'Réunion',
      slug: 'reunion',
      equality_score: 90,
      lgbti_criminalization: null,
    };
    expect(
      resolveEventCountry({
        countries: france,
        cities: { id: 'saint-denis-re', name: 'Saint-Denis', country_id: 're', countries: reunion },
      }),
    ).toBe(france);
  });
  it('uses the city country only when the event has no explicit country', () => {
    const france = { id: 'fr', name: 'France', equality_score: 90, lgbti_criminalization: null };
    expect(
      resolveEventCountry({
        countries: null,
        cities: { id: 'saint-denis-fr', name: 'Saint-Denis', countries: france },
      }),
    ).toBe(france);
    expect(resolveEventCountry(null)).toBeNull();
  });
});
