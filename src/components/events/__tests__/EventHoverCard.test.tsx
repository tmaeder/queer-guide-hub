/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, vars?: Record<string, unknown> | string) => {
      if (typeof vars === 'string') return vars;
      if (vars && typeof vars === 'object' && 'defaultValue' in vars) return String(vars.defaultValue);
      return _k;
    },
  }),
}));

import { EventHoverCard } from '../EventHoverCard';
import type { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];

function ev(o: Partial<Event>): Event {
  const startDate = o.start_date ?? new Date(Date.now() + 3 * 86400000).toISOString();
  return {
    id: o.id ?? 'e1',
    slug: o.slug ?? 's1',
    title: o.title ?? 'Drag Brunch',
    description: o.description ?? 'A short description for testing.',
    start_date: startDate,
    end_date: o.end_date ?? null,
    city: o.city ?? 'Berlin',
    country: o.country ?? 'DE',
    is_featured: o.is_featured ?? false,
    is_free: o.is_free ?? false,
    is_public: true,
    event_type: o.event_type ?? 'party',
    images: o.images ?? null,
  } as Event;
}

describe('EventHoverCard', () => {
  it('renders the trigger child', () => {
    render(
      <MemoryRouter>
        <EventHoverCard event={ev({})}>
          <button>trigger</button>
        </EventHoverCard>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'trigger' })).toBeTruthy();
  });

  it('exposes RSVP buttons when onRsvp is provided and user hovers', async () => {
    const onRsvp = vi.fn();
    render(
      <MemoryRouter>
        <EventHoverCard event={ev({ id: 'rsvp1' })} onRsvp={onRsvp}>
          <button data-testid="t">hover me</button>
        </EventHoverCard>
      </MemoryRouter>,
    );
    // Radix HoverCard opens on pointerenter; using focus is more deterministic in jsdom
    const trigger = screen.getByTestId('t');
    fireEvent.focus(trigger);
    // The popover content is portaled; query by accessible name pattern
    const going = await screen.findByRole('button', { name: /Going/i });
    fireEvent.click(going);
    expect(onRsvp).toHaveBeenCalledWith('rsvp1', 'going');
  });

  it('omits action row when no callbacks are provided', () => {
    render(
      <MemoryRouter>
        <EventHoverCard event={ev({})}>
          <button data-testid="t2">trigger</button>
        </EventHoverCard>
      </MemoryRouter>,
    );
    fireEvent.focus(screen.getByTestId('t2'));
    // No Going / Interested buttons rendered
    expect(screen.queryByRole('button', { name: /Going/i })).toBeNull();
  });
});
