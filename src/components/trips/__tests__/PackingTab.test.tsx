import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, ready: true }),
}));

const packingMock = {
  grouped: [] as unknown[],
  items: [] as unknown[],
  checkedCount: 0,
  totalCount: 0,
  isLoading: false,
};

vi.mock('@/hooks/useTripPacking', () => ({
  useTripPacking: () => packingMock,
  usePackingMutations: () => ({
    addPackingItem: { mutateAsync: vi.fn(), isPending: false, mutate: vi.fn() },
    toggleChecked: { mutate: vi.fn() },
    deletePackingItem: { mutate: vi.fn() },
    addPackingTemplate: { mutate: vi.fn() },
  }),
}));

vi.mock('@/components/trips/packing/PackingMarketplaceSuggestions', () => ({
  PackingMarketplaceSuggestions: () => null,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { PackingTab } from '../PackingTab';

describe('PackingTab empty-trip state', () => {
  it('renders empty state without crashing for a freshly created trip (no items, no dates, no places)', () => {
    renderWithProviders(<PackingTab tripId="trip-new" />);
    expect(screen.getByText('trips.packing.emptyTitle')).toBeInTheDocument();
    expect(screen.getByText('trips.packing.emptyDescription')).toBeInTheDocument();
  });

  it('is resilient when the hook returns undefined/partial state', () => {
    packingMock.grouped = undefined as unknown as [];
    packingMock.totalCount = undefined as unknown as number;
    expect(() => renderWithProviders(<PackingTab tripId="trip-new" />)).not.toThrow();
    packingMock.grouped = [];
    packingMock.totalCount = 0;
  });

  it('shows the template quick-add chips in the empty state', () => {
    renderWithProviders(<PackingTab tripId="trip-new" />);
    expect(screen.getByText('trips.packing.templates.essentials')).toBeInTheDocument();
    expect(screen.getByText('trips.packing.templates.beach')).toBeInTheDocument();
    expect(screen.getByText('trips.packing.templates.lgbtq-safety')).toBeInTheDocument();
  });

  it('renders a loading placeholder while packing data is loading (no crash)', () => {
    packingMock.isLoading = true;
    expect(() => renderWithProviders(<PackingTab tripId="trip-new" />)).not.toThrow();
    packingMock.isLoading = false;
  });
});
