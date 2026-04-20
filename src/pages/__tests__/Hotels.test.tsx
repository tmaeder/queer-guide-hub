import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

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
  useHotels: () => ({
    hotels: hookState.hotels,
    loading: hookState.loading,
    hasMore: hookState.hasMore,
    datasetTotal: hookState.datasetTotal,
    fetchHotels: fetchHotelsMock,
  }),
}));

vi.mock('@/components/hotels/HotelCard', () => ({
  HotelCard: ({ hotel, loading }: { hotel?: { id: string; name: string }; loading?: boolean }) =>
    loading ? <div data-testid="hotel-skeleton" /> : <div data-testid="hotel-card">{hotel?.name}</div>,
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

const wrap = (children: ReactNode) => <MemoryRouter>{children}</MemoryRouter>;

describe('Hotels page empty states', () => {
  beforeEach(() => {
    fetchHotelsMock.mockReset();
    hookState.hotels = [];
    hookState.loading = false;
    hookState.hasMore = false;
    hookState.datasetTotal = 0;
  });

  it('renders module-empty copy when datasetTotal is 0', () => {
    render(wrap(<Hotels />));
    expect(screen.getByText('No hotels yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Submit Hotel/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: /Reset filters/i })).not.toBeInTheDocument();
  });

  it('renders filtered-empty copy with reset button when filters active', () => {
    hookState.datasetTotal = 42;
    render(wrap(<Hotels />));
    fireEvent.click(screen.getByTestId('apply-search'));
    expect(screen.getByTestId('search-value').textContent).toBe('zzzz');
    expect(screen.getByText('No hotels match your filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset filters/i })).toBeInTheDocument();
    const chipRow = screen.getByTestId('empty-state-active-filters');
    expect(within(chipRow).getByText(/zzzz/)).toBeInTheDocument();
  });

  it('reset filters clears the search state', () => {
    hookState.datasetTotal = 42;
    render(wrap(<Hotels />));
    fireEvent.click(screen.getByTestId('apply-search'));
    expect(screen.getByTestId('search-value').textContent).toBe('zzzz');
    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    expect(screen.getByTestId('search-value').textContent).toBe('');
    expect(screen.queryByRole('button', { name: /Reset filters/i })).not.toBeInTheDocument();
  });

  it('renders hotels when data is present', () => {
    hookState.datasetTotal = 42;
    hookState.hotels = [{ id: '1', name: 'Stonewall Inn' }];
    render(wrap(<Hotels />));
    expect(screen.getByTestId('hotel-card')).toHaveTextContent('Stonewall Inn');
    expect(screen.queryByText('No hotels yet')).not.toBeInTheDocument();
    expect(screen.queryByText('No hotels match your filters')).not.toBeInTheDocument();
  });
});
