import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string, opts?: Record<string, string>) => {
      if (typeof d !== 'string') return _k;
      return opts ? d.replace(/\{\{(\w+)\}\}/g, (_, k) => opts[k] ?? '') : d;
    },
  }),
}));

vi.mock('@/hooks/useVisitorOrigin', () => ({
  useVisitorOrigin: () => ({ originIata: null, originCity: null, loading: false }),
}));

vi.mock('@/hooks/useTravelDeals', () => ({
  useTravelDeals: () => ({ data: [], isLoading: false }),
}));

const hotelSearchSpy = vi.fn(() => ({ data: [], isLoading: false }));
vi.mock('@/hooks/useHotelSearch', () => ({
  useHotelSearch: (opts: unknown) => hotelSearchSpy(opts),
}));

vi.mock('@/hooks/useActivitySearch', () => ({
  useActivitySearch: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useRecommendations', () => ({
  useRecommendations: () => ({ data: [] }),
}));

vi.mock('@/hooks/useTrackEvent', () => ({
  useTrackEvent: () => ({ track: vi.fn() }),
}));

vi.mock('@/components/personalization/TravelPrefsPrompt', () => ({
  TravelPrefsPrompt: () => null,
}));

vi.mock('@/components/travel/SpecialOffersSection', () => ({
  SpecialOffersSection: () => null,
}));

vi.mock('@/components/travel/FlightSearchForm', () => ({
  FlightSearchForm: () => null,
}));

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import Travel from '../Travel';

const testTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#222' },
    // @ts-expect-error brand is a custom extension
    brand: { main: '#DB2777' },
  },
});

function UrlProbe({ onChange }: { onChange: (p: URLSearchParams) => void }) {
  const [params] = useSearchParams();
  onChange(params);
  return null;
}

function renderAt(path: string, onUrlChange: (p: URLSearchParams) => void = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={testTheme}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/travel"
              element={
                <>
                  <Travel />
                  <UrlProbe onChange={onUrlChange} />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('Travel — hotels URL sync', { timeout: 20000 }, () => {
  beforeEach(() => hotelSearchSpy.mockClear());

  it('hydrates hotel filters from URL params and forwards to useHotelSearch', () => {
    renderAt('/travel?tab=hotels&city=Berlin&type=boutique&priceMin=80&priceMax=300&guests=3');

    const lastArg = hotelSearchSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(lastArg.city).toBe('Berlin');
    expect(lastArg.hotelType).toBe('boutique');
    expect(lastArg.priceMin).toBe(80);
    expect(lastArg.priceMax).toBe(300);
    expect(lastArg.guests).toBe(3);

    // "Boutique Hotel" appears in Select + chip, so getAllByText
    expect(screen.getAllByText(/Boutique Hotel/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/≥ €80/)).toBeInTheDocument();
    expect(screen.getByText(/≤ €300/)).toBeInTheDocument();
  });

  it('ignores invalid type/price URL params', () => {
    renderAt('/travel?tab=hotels&city=Berlin&type=bogus&priceMin=-5&priceMax=notanumber');

    const lastArg = hotelSearchSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(lastArg.city).toBe('Berlin');
    expect(lastArg.hotelType).toBeUndefined();
    expect(lastArg.priceMin).toBeUndefined();
    expect(lastArg.priceMax).toBeUndefined();
  });

  it('filter-aware empty state shows Clear filters when filters active and zero results', () => {
    renderAt('/travel?tab=hotels&city=Berlin&type=boutique');
    const clearButtons = screen.getAllByRole('button', { name: /Clear filters/i });
    expect(clearButtons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/No hotels match your filters in Berlin/)).toBeInTheDocument();
  });

  it('clicking a chip removes that filter from URL', () => {
    let latest: URLSearchParams = new URLSearchParams();
    renderAt('/travel?tab=hotels&city=Berlin&type=boutique&priceMin=80', (p) => {
      latest = p;
    });

    const chip = document.querySelector('.MuiChip-root[class*="MuiChip-deletable"]');
    expect(chip).toBeTruthy();
    const deleteIcon = chip!.querySelector('.MuiChip-deleteIcon') as HTMLElement;
    fireEvent.click(deleteIcon);

    expect(latest.get('type')).toBeNull();
    expect(latest.get('priceMin')).toBe('80');
  });
});
