/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

// The parts barrel reaches maplibre through EntityMap, whose worker URL vitest
// refuses to resolve. Nothing here exercises the map.
vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => <div data-testid="map" /> }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));

import {
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

describe('EventActions', () => {
  const upcoming = { ...event, start_date: '2999-01-01T00:00:00Z' };

  it('offers tickets only when there is a ticket url', () => {
    renderWithProviders(<EventActions event={upcoming as never} onShare={() => {}} />);
    expect(screen.queryByRole('link', { name: /tickets/i })).toBeNull();

    renderWithProviders(
      <EventActions
        event={{ ...upcoming, ticket_url: 'https://tickets.example/x' } as never}
        onShare={() => {}}
      />,
    );
    expect(screen.getByRole('link', { name: /tickets/i })).toHaveAttribute(
      'href',
      'https://tickets.example/x',
    );
  });

  it('withdraws the ticket link once the event is over', () => {
    // The masthead row is the SECOND ticket surface and the one above the
    // fold; the decision card in the rail is the other. 443 live events are
    // past and carry a ticket_url, and selling a seat at a finished event is
    // the kind of wrong a layout change must not leave half-fixed.
    renderWithProviders(
      <EventActions
        event={
          {
            ...event,
            start_date: '2020-01-01T00:00:00Z',
            end_date: null,
            ticket_url: 'https://tickets.example/x',
          } as never
        }
        onShare={() => {}}
      />,
    );
    expect(screen.queryByRole('link', { name: /tickets/i })).toBeNull();
  });

  it('keeps the website link on a past event — a homepage still documents it', () => {
    renderWithProviders(
      <EventActions
        event={
          {
            ...event,
            start_date: '2020-01-01T00:00:00Z',
            end_date: null,
            website: 'https://example.org/pride',
          } as never
        }
        onShare={() => {}}
      />,
    );
    expect(screen.getByRole('link', { name: /website/i })).toBeInTheDocument();
  });
});
