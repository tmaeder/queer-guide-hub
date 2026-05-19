/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const { useVillagesMock, useTripsMock, useVisitedMock } = vi.hoisted(() => ({
  useVillagesMock: vi.fn(),
  useTripsMock: vi.fn(),
  useVisitedMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useQueerVillages', () => ({ useQueerVillages: () => useVillagesMock() }));
vi.mock('@/hooks/useDiscoverableTrips', () => ({ useDiscoverableTrips: () => useTripsMock() }));
vi.mock('@/hooks/useVisitedPlaceLookup', () => ({ useVisitedPlaceLookup: () => useVisitedMock() }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('@/components/villages/VillageCard', () => ({
  VillageCard: ({ village }: { village: { id: string; name?: string } }) => (
    <div data-testid="village">{village.id}</div>
  ),
}));
vi.mock('@/components/trips/PublicTripCard', () => ({
  PublicTripCard: ({ trip }: { trip: { id: string } }) => <div data-testid="public-trip">{trip.id}</div>,
}));

import { InspirationGrid } from '../InspirationGrid';

beforeEach(() => {
  useVillagesMock.mockReset();
  useTripsMock.mockReset();
  useVisitedMock.mockReset();
  useVisitedMock.mockReturnValue({ has: () => false });
});

describe('InspirationGrid', () => {
  it('renders a single full-width column with up to 6 villages when no public trips', () => {
    const villages = Array.from({ length: 8 }, (_, i) => ({ id: String(i), name: `v${i}` }));
    useVillagesMock.mockReturnValue({ villages, loading: false });
    useTripsMock.mockReturnValue({ data: [], isLoading: false });
    render(<MemoryRouter><InspirationGrid /></MemoryRouter>);
    expect(screen.getAllByTestId('village')).toHaveLength(6);
    expect(screen.queryByTestId('public-trip')).toBeNull();
    expect(screen.queryByText(/No public trips yet/i)).toBeNull();
  });

  it('renders two columns when public trips exist', () => {
    useVillagesMock.mockReturnValue({
      villages: [{ id: '1', name: 'v1' }, { id: '2', name: 'v2' }, { id: '3', name: 'v3' }],
      loading: false,
    });
    useTripsMock.mockReturnValue({
      data: [{ id: 't1' }, { id: 't2' }],
      isLoading: false,
    });
    render(<MemoryRouter><InspirationGrid /></MemoryRouter>);
    expect(screen.getAllByTestId('village')).toHaveLength(3);
    expect(screen.getAllByTestId('public-trip')).toHaveLength(2);
  });
});
