/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/venues/VenueCard', () => ({
  VenueCard: (p: { venue: { id: string; name?: string } }) => <div data-testid="venue">{p.venue.name}</div>,
}));
vi.mock('@/components/villages/VillageCard', () => ({
  VillageCard: (p: { village: { id: string; name?: string } }) => <div data-testid="village">{p.village.name}</div>,
}));
vi.mock('@/components/ui/loading', () => ({
  InlineLoading: (p: { text: string }) => <div>{p.text}</div>,
}));
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: (p: { title: string }) => <div>{p.title}</div>,
}));
vi.mock('@/components/discovery', () => ({
  BentoSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  spansForPreset: () => 'sm',
}));

import { CityVenuesTab } from '../CityVenuesTab';

const city = { name: 'Berlin' } as never;
const base = {
  city,
  villages: [],
  villagesLoading: false,
  showCreateTrip: false,
  onCreateTrip: vi.fn(),
};

describe('CityVenuesTab', () => {
  it('shows loading indicator', () => {
    render(<CityVenuesTab {...base} venues={[]} venuesLoading />);
    expect(screen.getByText(/Loading venues/)).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<CityVenuesTab {...base} venues={[]} venuesLoading={false} />);
    expect(screen.getByText(/No venues yet/)).toBeInTheDocument();
  });

  it('renders one card per venue', () => {
    render(
      <CityVenuesTab
        {...base}
        venues={[{ id: 'v1', name: 'A' }, { id: 'v2', name: 'B' }] as never}
        venuesLoading={false}
      />,
    );
    expect(screen.getAllByTestId('venue')).toHaveLength(2);
  });

  it('renders LGBTQ+ neighborhoods when villages present', () => {
    render(
      <CityVenuesTab
        {...base}
        venues={[]}
        venuesLoading={false}
        villages={[{ id: 'g1', name: 'Schöneberg' }] as never}
      />,
    );
    expect(screen.getByTestId('village')).toHaveTextContent('Schöneberg');
  });

  it('shows Create Trip CTA + fires onCreateTrip when shown', () => {
    const onCreate = vi.fn();
    render(<CityVenuesTab {...base} venues={[]} venuesLoading={false} showCreateTrip onCreateTrip={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /Create trip/i }));
    expect(onCreate).toHaveBeenCalled();
  });
});
