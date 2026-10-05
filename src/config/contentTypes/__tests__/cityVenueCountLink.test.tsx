/**
 * @vitest-environment jsdom
 *
 * The Cities list's Venues count links to the Venues list filtered on
 * `city_id` — the key `venues(count)` counts through — so the number and the
 * list it opens agree. A zero count stays plain text: a link to an empty list
 * is a dead end.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { cityContentType, cityFields } from '../city';
import { venueContentType } from '../venue';
import { eventContentType } from '../event';

const venueCount = cityFields.find((f) => f.name === 'venue_count')!;

const renderCell = (row: Record<string, unknown>) =>
  render(<MemoryRouter>{venueCount.listRender!(row)}</MemoryRouter>);

describe('cities venue_count cell', () => {
  it('links a non-zero count to the city-filtered Venues list', () => {
    renderCell({ id: 'c-1', name: 'Berlin', venues: [{ count: 12 }] });
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(
      '/admin/content/venues?city_id=c-1&city_id_label=Berlin',
    );
    expect(link.textContent).toBe('12');
  });

  it('renders a zero count as text', () => {
    renderCell({ id: 'c-1', name: 'Berlin', venues: [{ count: 0 }] });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('0')).toBeTruthy();
  });
});

describe('cities venue count scope', () => {
  it('counts what the linked lists show, using the venues/events configs themselves', () => {
    // Prod, Berlin: raw embed 1,242 vs 869 unmerged+unarchived. Passing the
    // venues config (not a restated predicate) keeps the two from drifting.
    expect(cityContentType.listEmbedScopes).toEqual([
      { embed: 'venues', type: venueContentType },
      { embed: 'events', type: eventContentType },
    ]);
  });
});

describe('cities event_count cell', () => {
  const eventCount = cityFields.find((f) => f.name === 'event_count')!;
  it('links a non-zero count to the city-filtered Events list', () => {
    render(
      <MemoryRouter>
        {eventCount.listRender!({ id: 'c-1', name: 'Berlin', events: [{ count: 3 }] })}
      </MemoryRouter>,
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/admin/content/events?city_id=c-1&city_id_label=Berlin',
    );
  });
});
