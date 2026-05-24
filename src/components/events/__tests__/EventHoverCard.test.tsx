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
vi.mock('@/hooks/useEntityTripStatus', () => ({
  useEntityTripStatus: () => ({ data: { isInTrip: false, trips: [] }, isLoading: false, error: null }),
}));
vi.mock('@/components/trips/AddToTripDialog', () => ({
  AddToTripDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="add-to-trip-dialog" /> : null),
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
    const trigger = screen.getByTestId('t');
    fireEvent.focus(trigger);
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
    expect(screen.queryByRole('button', { name: /Going/i })).toBeNull();
  });

  it('opens AddToTripDialog when enableSaveToTrip is set and Save is clicked', async () => {
    render(
      <MemoryRouter>
        <EventHoverCard event={ev({ id: 'save1' })} enableSaveToTrip>
          <button data-testid="t3">trigger</button>
        </EventHoverCard>
      </MemoryRouter>,
    );
    fireEvent.focus(screen.getByTestId('t3'));
    const save = await screen.findByRole('button', { name: /Save to trip/i });
    fireEvent.click(save);
    expect(screen.getByTestId('add-to-trip-dialog')).toBeTruthy();
  });
});
