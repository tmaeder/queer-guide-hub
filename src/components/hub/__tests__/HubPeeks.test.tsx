import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/usePageFetchers', () => ({
  fetchAllUserFavorites: async () => ({
    venues: [{ id: 'v1', slug: 'bar-rouge', name: 'Bar Rouge', category: 'bar' }],
    events: [{ id: 'e1', slug: null, title: 'Pride Zürich', city: 'Zürich' }],
    marketplace: [{ id: 'm1', slug: 'harness', title: 'Harness', business_name: 'Shop' }],
    news: [{ id: 'n1', slug: 'story', title: 'A story' }],
  }),
  fetchProfilesByUserIds: async () => [],
}));
vi.mock('@/hooks/useTrips', () => ({
  useTrips: () => ({
    isLoading: false,
    data: [
      {
        id: 't-old',
        title: 'Old trip',
        status: 'completed',
        start_date: '2020-01-01',
        end_date: '2020-01-05',
      },
      {
        id: 't-next',
        title: 'Berlin',
        status: 'planning',
        start_date: '2099-07-10',
        end_date: '2099-07-12',
      },
    ],
  }),
}));

import { PlansPeek, SavedPeek } from '../HubPeeks';

function renderPeek(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const href = (name: string) =>
  screen.getByRole('link', { name: new RegExp(name) }).getAttribute('href');

describe('Hub menu previews', () => {
  it('Saved links each item to its own page, by slug or id', async () => {
    renderPeek(<SavedPeek onNavigate={() => {}} openLabel="Saved" />);
    await screen.findByText('Bar Rouge');
    expect(href('Bar Rouge')).toBe('/venues/bar-rouge');
    expect(href('Pride Zürich')).toBe('/events/e1');
    expect(href('Harness')).toBe('/marketplace/harness');
    expect(href('A story')).toBe('/news/story');
    expect(href('^Saved')).toBe('/hub/saved');
  });

  it('Plans lists upcoming trips only, linked to the trip', () => {
    renderPeek(<PlansPeek onNavigate={() => {}} openLabel="Plans" />);
    expect(href('Berlin')).toBe('/trips/t-next');
    expect(screen.queryByText('Old trip')).toBeNull();
  });
});
