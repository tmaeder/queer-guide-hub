/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/venues/VenueCard', () => ({
  VenueCard: (p: { venue: { id: string; name?: string } }) => <div data-testid="venue">{p.venue.name}</div>,
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
vi.mock('@/components/discovery', () => ({
  BentoSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  spansForPreset: () => 'sm',
}));

import { CityVenuesTab } from '../CityVenuesTab';

const city = { name: 'Berlin' } as never;

describe('CityVenuesTab', () => {
  it('shows loading indicator', () => {
    render(<CityVenuesTab city={city} venues={[]} venuesLoading showCreateTrip={false} onCreateTrip={vi.fn()} />);
    expect(screen.getByText(/Loading venues/)).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<CityVenuesTab city={city} venues={[]} venuesLoading={false} showCreateTrip={false} onCreateTrip={vi.fn()} />);
    expect(screen.getByText(/No venues found yet/)).toBeInTheDocument();
  });

  it('renders one card per venue', () => {
    render(
      <CityVenuesTab
        city={city}
        venues={[{ id: 'v1', name: 'A' }, { id: 'v2', name: 'B' }] as never}
        venuesLoading={false} showCreateTrip={false} onCreateTrip={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('venue')).toHaveLength(2);
  });

  it('shows Create Trip CTA + fires onCreateTrip when shown', () => {
    const onCreate = vi.fn();
    render(<CityVenuesTab city={city} venues={[]} venuesLoading={false} showCreateTrip onCreateTrip={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /Create Trip/i }));
    expect(onCreate).toHaveBeenCalled();
  });
});
