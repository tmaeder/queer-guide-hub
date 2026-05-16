/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useFeaturedEventsMock } = vi.hoisted(() => ({ useFeaturedEventsMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useFeaturedEvents', () => ({ useFeaturedEvents: useFeaturedEventsMock }));
vi.mock('@/components/events/EventCard', () => ({
  EventCard: (p: { event?: { id: string }; loading?: boolean }) =>
    p.loading ? <div data-testid="loading" /> : <div data-testid="card">{p.event?.id}</div>,
}));
vi.mock('@/components/events/EventRail', () => ({
  EventRail: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section><h2>{title}</h2>{children}</section>
  ),
  EventRailItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { FeaturedEventsRail } from '../FeaturedEventsRail';

beforeEach(() => useFeaturedEventsMock.mockReset());

describe('FeaturedEventsRail', () => {
  it('renders 4 skeleton cards while loading', () => {
    useFeaturedEventsMock.mockReturnValue({ events: [], loading: true });
    render(<FeaturedEventsRail />);
    expect(screen.getAllByTestId('loading')).toHaveLength(4);
  });

  it('renders nothing when no events and not loading', () => {
    useFeaturedEventsMock.mockReturnValue({ events: [], loading: false });
    const { container } = render(<FeaturedEventsRail />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one card per event with title heading', () => {
    useFeaturedEventsMock.mockReturnValue({
      events: [{ id: 'e1' }, { id: 'e2' }],
      loading: false,
    });
    render(<FeaturedEventsRail />);
    expect(screen.getByRole('heading', { name: /Featured this week/i })).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(2);
  });
});
