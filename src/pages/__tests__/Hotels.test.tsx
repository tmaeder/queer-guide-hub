import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, fireEvent, within } from '@/test/test-utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => vi.fn(),
}));

const fetchHotelsMock = vi.fn();
const hookState: {
  hotels: Array<{ id: string; name: string }>;
  loading: boolean;
  hasMore: boolean;
  datasetTotal: number | null;
} = { hotels: [], loading: false, hasMore: false, datasetTotal: 0 };

vi.mock('@/hooks/useHotels', () => ({
  useHotelsFeed: (request: unknown) => {
    fetchHotelsMock(request);
    return {
      hotels: hookState.hotels,
      loading: hookState.loading,
      loadingMore: false,
      hasMore: hookState.hasMore,
      datasetTotal: hookState.datasetTotal,
      loadMore: vi.fn(),
    };
  },
}));

vi.mock('@/hooks/useHotelFilterMeta', () => ({
  useHotelFilterMeta: () => ({
    data: { availableTypes: new Set(['bnb', 'apartment']), priceAvailable: false },
  }),
}));

vi.mock('@/components/hotels/HotelCard', () => ({
  HotelCard: ({ hotel, loading }: { hotel?: { id: string; name: string }; loading?: boolean }) =>
    loading ? (
      <div data-testid="hotel-skeleton" />
    ) : (
      <div data-testid="hotel-card">{hotel?.name}</div>
    ),
}));

vi.mock('@/components/hotels/HotelFilters', () => ({
  HotelFilters: ({
    search,
    onSearchChange,
  }: {
    search: string;
    onSearchChange: (v: string) => void;
    hotelType: string;
    onTypeChange: (v: string) => void;
    priceRange: string;
    onPriceChange: (v: string) => void;
  }) => (
    <div>
      <span data-testid="search-value">{search}</span>
      <button type="button" data-testid="apply-search" onClick={() => onSearchChange('zzzz')}>
        apply
      </button>
    </div>
  ),
}));

import Hotels from '../Hotels';

describe('Hotels page empty states', () => {
  beforeEach(() => {
    fetchHotelsMock.mockReset();
    hookState.hotels = [];
    hookState.loading = false;
    hookState.hasMore = false;
    hookState.datasetTotal = 0;
  });

  // The request is derived from filter state, seeded from the URL, so a shared
  // link's first request already carries its filters.
  it('derives the first request from the URL', () => {
    renderWithProviders(<Hotels />, { route: '/hotels?type=bnb&city=Berlin&view=map' });
    expect(fetchHotelsMock.mock.calls[0][0]).toEqual({
      filters: { hotel_type: 'bnb', city: 'Berlin' },
      mapMode: true,
    });
  });

  it('renders module-empty copy when datasetTotal is 0', () => {
    renderWithProviders(<Hotels />);
    expect(screen.getByText('No hotels yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Submit Hotel/i }).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.queryByRole('button', { name: /Reset filters/i })).not.toBeInTheDocument();
  });

  it('renders filtered-empty copy with reset button when filters active', () => {
    hookState.datasetTotal = 42;
    renderWithProviders(<Hotels />);
    fireEvent.click(screen.getByTestId('apply-search'));
    expect(screen.getByTestId('search-value').textContent).toBe('zzzz');
    expect(screen.getByText('No hotels match your filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset filters/i })).toBeInTheDocument();
    const chipRow = screen.getByTestId('empty-state-active-filters');
    expect(within(chipRow).getByText(/zzzz/)).toBeInTheDocument();
  });

  it('reset filters clears the search state', () => {
    hookState.datasetTotal = 42;
    renderWithProviders(<Hotels />);
    fireEvent.click(screen.getByTestId('apply-search'));
    expect(screen.getByTestId('search-value').textContent).toBe('zzzz');
    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    expect(screen.getByTestId('search-value').textContent).toBe('');
    expect(screen.queryByRole('button', { name: /Reset filters/i })).not.toBeInTheDocument();
  });

  it('renders hotels when data is present', () => {
    hookState.datasetTotal = 42;
    hookState.hotels = [{ id: '1', name: 'Stonewall Inn' }];
    renderWithProviders(<Hotels />);
    expect(screen.getByTestId('hotel-card')).toHaveTextContent('Stonewall Inn');
    expect(screen.queryByText('No hotels yet')).not.toBeInTheDocument();
    expect(screen.queryByText('No hotels match your filters')).not.toBeInTheDocument();
  });
});
