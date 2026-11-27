/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { NearYouResult } from '@/hooks/useHomeNearYou';

const { state, refetch } = vi.hoisted(() => ({
  state: { regionLoading: false, isError: false, data: undefined as NearYouResult | undefined },
  refetch: vi.fn(),
}));

vi.mock('@/components/home/useHomeCity', () => ({
  useHomeCity: () => ({ loading: state.regionLoading, cityId: 'c1', cityName: 'Berlin' }),
}));
vi.mock('@/hooks/useHomeNearYou', () => ({
  useHomeNearYou: () => ({ data: state.data, isLoading: false, isError: state.isError, refetch }),
}));

import { DeparturesBoard } from '../DeparturesBoard';

// Both layouts render; CSS shows the list on phones and the gallery on sm+.
const list = () => within(document.querySelector<HTMLElement>('[data-layout="list"]')!);

beforeEach(() => {
  state.regionLoading = false;
  state.isError = false;
  state.data = undefined;
  refetch.mockClear();
});

describe('homepage listings', () => {
  it('does not report an empty board while the region is resolving', () => {
    state.regionLoading = true;
    const { container } = renderWithProviders(<DeparturesBoard />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText(/no upcoming events/i)).not.toBeInTheDocument();
  });

  it('says the city has no events instead of filling with other cities', () => {
    state.data = { scope: 'city', localCount: 0, tripCount: 0, rows: [] };
    renderWithProviders(<DeparturesBoard />);
    expect(screen.getByText(/No upcoming events in/)).toBeInTheDocument();
  });

  it('keeps cached city events usable after a failed refresh and offers retry', () => {
    state.isError = true;
    state.data = {
      scope: 'city',
      localCount: 1,
      tripCount: 0,
      rows: [
        {
          kind: 'event',
          id: '1',
          slug: 'pride',
          title: 'Pride',
          via: 'Berlin',
          rung: 'local',
          startDate: null,
        },
      ],
    };

    renderWithProviders(<DeparturesBoard />);
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByTitle('Berlin')).toBeVisible();
    expect(list().getByRole('link', { name: 'Pride Berlin' })).toHaveAttribute(
      'href',
      '/events/pride',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t refresh these results.');
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('puts the event date in the bullet instead of the letter E, without repeating it below', () => {
    state.data = {
      scope: 'city',
      localCount: 1,
      tripCount: 0,
      rows: [
        {
          kind: 'event',
          id: '2',
          slug: 'party',
          title: 'Party',
          via: 'Paris',
          rung: 'local',
          // Local time, so the assertions do not depend on the runner's zone.
          startDate: new Date(2026, new Date().getMonth(), 18, 17, 0).toISOString(),
        },
      ],
    };
    const { container } = renderWithProviders(<DeparturesBoard />);
    const link = list().getByRole('link', { name: /Party/ });
    expect(container.querySelector('[data-letter="E"]')).toBeNull();
    expect(link).toHaveTextContent('18');
    // Once, in the badge; the line below names the place only.
    expect(link.querySelectorAll('time')).toHaveLength(1);
    expect(link.querySelector('time')).toHaveTextContent('17:00');
    expect(link.textContent?.replace(link.querySelector('time')!.textContent!, '')).not.toMatch(
      /17:00/,
    );
  });
  it('keeps a confirmed calendar date and does not invent an event time', () => {
    state.data = {
      scope: 'city',
      localCount: 1,
      tripCount: 0,
      rows: [
        {
          kind: 'event',
          id: 'day',
          slug: 'day',
          title: 'Pride day',
          via: 'London',
          rung: 'local',
          startDate: '2027-07-24T00:00:00Z',
          timezone: 'Europe/London',
          datePrecision: 'day',
        },
      ],
    };
    const { container } = renderWithProviders(<DeparturesBoard />);
    const date = container.querySelector('time');
    expect(date).toHaveAttribute('datetime', '2027-07-24');
    expect(date).toHaveTextContent('24');
    expect(date).not.toHaveTextContent('01:00');
  });

  it('uses the event timezone across a UTC date boundary', () => {
    state.data = {
      scope: 'city',
      localCount: 1,
      tripCount: 0,
      rows: [
        {
          kind: 'event',
          id: 'zone',
          slug: 'zone',
          title: 'Late party',
          via: 'Los Angeles',
          rung: 'local',
          startDate: '2027-01-19T01:30:00Z',
          timezone: 'America/Los_Angeles',
        },
      ],
    };
    const { container } = renderWithProviders(<DeparturesBoard />);
    // Monday 18 Jan, 17:30 in Los Angeles — Tuesday 19 Jan in UTC.
    const badge = container.querySelector('time.transit-marker');
    expect(badge).toHaveTextContent('JAN1817:30');
    expect(badge).toHaveTextContent('Monday');
    expect(badge).toHaveTextContent('2027');
    expect(list().getByRole('link', { name: /Late party/ })).toHaveTextContent('Los Angeles');
  });

  it('shows dates and event types as one-tap chips, and a type chip filters the rows', () => {
    const row = (id: string, eventType: string) => ({
      kind: 'event' as const,
      id,
      slug: id,
      title: `Event ${id}`,
      via: 'Berlin',
      rung: 'local' as const,
      eventType,
      startDate: new Date(2026, 11, 20, 20, 0).toISOString(),
    });
    state.data = {
      scope: 'city',
      localCount: 3,
      tripCount: 0,
      rows: [row('a', 'pride'), row('b', 'festival'), row('c', 'pride')],
    } as NearYouResult;
    renderWithProviders(<DeparturesBoard />);
    // No dropdowns: every date choice is visible.
    expect(screen.getByRole('group', { name: 'When' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /All types/ })).toBeNull();
    const types = screen.getByRole('group', { name: 'Event types' });
    const festival = Array.from(types.querySelectorAll('button')).find((b) =>
      /festival/i.test(b.textContent ?? ''),
    )!;
    fireEvent.click(festival);
    expect(festival).toHaveAttribute('aria-pressed', 'true');
    expect(list().getByRole('link', { name: /Event b/ })).toBeInTheDocument();
    expect(list().queryByRole('link', { name: /Event a/ })).toBeNull();
    // Tapping it again shows everything.
    fireEvent.click(festival);
    expect(list().getByRole('link', { name: /Event a/ })).toBeInTheDocument();
  });
});
