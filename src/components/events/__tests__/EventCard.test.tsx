/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useEntityTripStatus', () => ({ useEntityTripStatus: () => ({ data: null }) }));
vi.mock('@/hooks/useVisitedPlaceLookup', () => ({ useVisitedPlaceLookup: () => ({ has: () => false, mark: vi.fn() }) }));
vi.mock('@/hooks/useActiveTrip', () => ({ useActiveTrip: () => ({ trip: null, addToTrip: vi.fn(), removeFromTrip: vi.fn(), isInTrip: () => false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { expectNoNestedInteractive } from '@/test/test-utils';
import { EventCard } from '../EventCard';

// Tags matter: without them the chip row never mounts and the nested-anchor
// regression this fixture guards against would go undetected.
const EVENT = {
  id: 'e1',
  title: 'Pride',
  slug: 'pride',
  start_date: '2026-06-01',
  tags: ['bear-bar', 'drag-show', 'queer-owned'],
} as never;

describe('EventCard', () => {
  it('renders loading state', () => {
    const { container } = render(<MemoryRouter><EventCard loading /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('renders event', () => {
    const { container } = render(
      <MemoryRouter><EventCard event={EVENT} /></MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('exposes exactly one link, pointing at the event detail page', () => {
    render(<MemoryRouter><EventCard event={EVENT} /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/events/pride');
    // Accessible name must match the visible title (WCAG 2.5.3).
    expect(links[0]).toHaveAccessibleName('Pride');
  });

  it('nests no interactive element inside the card link', () => {
    const { container } = render(<MemoryRouter><EventCard event={EVENT} /></MemoryRouter>);
    expectNoNestedInteractive(container);
  });
});
