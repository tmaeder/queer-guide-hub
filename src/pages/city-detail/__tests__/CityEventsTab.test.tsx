/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/events/EventCard', () => ({
  EventCard: (p: { event: { id: string; title?: string } }) => <div data-testid="event">{p.event.title}</div>,
}));
vi.mock('@/components/ui/loading', () => ({
  InlineLoading: (p: { text: string }) => <div>{p.text}</div>,
}));
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: (p: { title: string }) => <div>{p.title}</div>,
}));
vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { CityEventsTab } from '../CityEventsTab';

const city = { name: 'Berlin' } as never;

describe('CityEventsTab', () => {
  it('shows loading indicator', () => {
    render(<CityEventsTab city={city} events={[]} eventsLoading />);
    expect(screen.getByText(/Loading events/)).toBeInTheDocument();
  });

  it('shows empty state when no events', () => {
    render(<CityEventsTab city={city} events={[]} eventsLoading={false} />);
    expect(screen.getByText(/No upcoming events/)).toBeInTheDocument();
  });

  it('renders one card per event', () => {
    render(
      <CityEventsTab
        city={city}
        events={[{ id: 'e1', title: 'A' }, { id: 'e2', title: 'B' }] as never}
        eventsLoading={false}
      />,
    );
    expect(screen.getAllByTestId('event')).toHaveLength(2);
  });
});
