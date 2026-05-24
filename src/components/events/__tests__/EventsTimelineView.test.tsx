/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { EventsTimelineView } from '../EventsTimelineView';
import type { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];

function ev(overrides: Partial<Event>): Event {
  return {
    id: overrides.id ?? 'e1',
    slug: overrides.slug ?? 'slug',
    title: overrides.title ?? 'Event',
    start_date: overrides.start_date ?? '2026-06-01T12:00:00Z',
    end_date: overrides.end_date ?? null,
    city: overrides.city ?? 'Berlin',
    country: overrides.country ?? 'DE',
    is_featured: overrides.is_featured ?? false,
    is_free: overrides.is_free ?? false,
    is_public: true,
    event_type: overrides.event_type ?? 'party',
  } as Event;
}

describe('EventsTimelineView', () => {
  it('renders toolbar + track even with no events', () => {
    render(
      <MemoryRouter>
        <EventsTimelineView events={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: /Events timeline/i })).toBeTruthy();
    expect(screen.getByRole('toolbar', { name: /Timeline navigation/i })).toBeTruthy();
  });

  it('renders a single event with a link to its slug', () => {
    render(
      <MemoryRouter>
        <EventsTimelineView events={[ev({ id: 'e1', slug: 'pride-berlin', title: 'Pride Berlin' })]} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /Pride Berlin/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('/events/pride-berlin');
  });

  it('clusters ≥3 short events that bunch together into a single chip', () => {
    const events = [
      ev({ id: '1', slug: 's1', title: 'A', start_date: '2026-06-01T12:00:00Z' }),
      ev({ id: '2', slug: 's2', title: 'B', start_date: '2026-06-01T12:05:00Z' }),
      ev({ id: '3', slug: 's3', title: 'C', start_date: '2026-06-01T12:10:00Z' }),
      ev({ id: '4', slug: 's4', title: 'D', start_date: '2026-06-01T12:15:00Z' }),
    ];
    render(
      <MemoryRouter>
        <EventsTimelineView events={events} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /4 events around/i })).toBeTruthy();
  });
});
