/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/usePersonalizedCities', () => ({
  fetchTrendingCities: vi.fn().mockResolvedValue([
    {
      id: 'c1',
      name: 'Berlin',
      slug: 'berlin',
      image_url: 'https://images.example.com/berlin.jpg',
      population: 3600000,
      countries: { name: 'Germany', equality_score: 76 },
    },
    {
      id: 'c2',
      name: 'Madrid',
      slug: null,
      image_url: null,
      population: 3200000,
      countries: { name: 'Spain', equality_score: 80 },
    },
  ]),
}));

import HomeDestinations from '../HomeDestinations';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HomeDestinations', () => {
  it('renders city cards linking to /city/{slug} (id fallback)', async () => {
    renderWithProviders(<HomeDestinations />);
    await waitFor(() => expect(screen.getByText('Berlin')).toBeTruthy());
    expect(screen.getByText('Madrid')).toBeTruthy();
    expect(screen.getByText('Germany')).toBeTruthy();

    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links.some((h) => h?.endsWith('/city/berlin'))).toBe(true);
    // slug-less city falls back to id
    expect(links.some((h) => h?.endsWith('/city/c2'))).toBe(true);
  });
});
