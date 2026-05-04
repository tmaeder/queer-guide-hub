import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const fetchArticles = vi.fn();
const useNewsState = {
  articles: [] as Array<Record<string, unknown>>,
  sources: [] as Array<{ id: string; name: string }>,
  categories: [] as Array<{ id: string; slug: string; name: string }>,
  articleTags: {} as Record<string, unknown>,
  loading: false,
  error: null as string | null,
  fetchArticles,
  fetchTagsForArticles: vi.fn(),
  incrementViews: vi.fn(),
  getFeaturedArticles: vi.fn().mockResolvedValue([]),
  getTrendingTags: vi.fn().mockResolvedValue([]),
  loadingTimedOut: false,
};

vi.mock('@/hooks/useNews', () => ({ useNews: () => useNewsState }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => {
      if (p === 'then') return undefined;
      return (..._a: unknown[]) => new Proxy(() => {}, handler);
    },
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

vi.mock('@/components/news/NewsFilters', () => ({ NewsFilters: () => null }));
vi.mock('@/components/news/NewsCard', () => ({ NewsCard: () => null }));
vi.mock('@/components/animation/StaggerGrid', () => ({
  StaggerGrid: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import News from '../News';

const BAD_TOKENS = ['null', 'undefined', '[object Object]'];

function resetState() {
  fetchArticles.mockReset();
  useNewsState.articles = [];
  useNewsState.loading = false;
  useNewsState.error = null;
}

describe('News empty state', () => {
  beforeEach(resetState);

  it('renders neutral copy when no filters are active and no articles', () => {
    render(
      <MemoryRouter>
        <News />
      </MemoryRouter>,
    );
    expect(screen.getByText('The newsroom is quiet')).toBeInTheDocument();
    expect(screen.getByText('No stories right now. Check back soon.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset filters' })).not.toBeInTheDocument();

    const text = document.body.textContent || '';
    for (const token of BAD_TOKENS) expect(text).not.toContain(token);
  });

  it('renders filtered empty state with primary Reset filters button when search is active', () => {
    const { container } = render(
      <MemoryRouter>
        <News />
      </MemoryRouter>,
    );
    const searchInput = screen.getByPlaceholderText('Quick search articles...') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'zzznoresults' } });

    expect(screen.getByText('No news matches your filters')).toBeInTheDocument();
    expect(screen.getByText('Try resetting your filters or exploring another topic.')).toBeInTheDocument();

    const emptyChips = screen.getByTestId('empty-state-active-filters');
    expect(within(emptyChips).getByText(/Search: zzznoresults/)).toBeInTheDocument();

    const resetBtn = screen.getByRole('button', { name: 'Reset filters' });
    expect(resetBtn).toBeInTheDocument();

    fetchArticles.mockClear();
    fireEvent.click(resetBtn);

    expect(fetchArticles).toHaveBeenLastCalledWith({});
    expect(searchInput.value).toBe('');

    const text = container.textContent || '';
    for (const token of BAD_TOKENS) expect(text).not.toContain(token);
  });

  it('keeps the Active Filters summary when filters are active AND results exist', () => {
    useNewsState.articles = [
      {
        id: '1',
        title: 'Hello',
        published_at: new Date().toISOString(),
        views_count: 0,
        city_ids: [],
        country_ids: [],
      },
    ] as unknown as typeof useNewsState.articles;

    render(
      <MemoryRouter>
        <News />
      </MemoryRouter>,
    );
    const searchInput = screen.getByPlaceholderText('Quick search articles...') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'hello' } });

    expect(screen.getByText('Active filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument();
    expect(screen.queryByText('No news matches your filters')).not.toBeInTheDocument();
  });
});
