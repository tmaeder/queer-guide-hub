import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, fireEvent, expectNoPlaceholderLeaks } from '@/test/test-utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));

const fetchArticlesMock = vi.fn();
const newsState: {
  articles: Array<Record<string, unknown>>;
  loading: boolean;
  error: string | null;
  loadingTimedOut: boolean;
} = {
  articles: [],
  loading: false,
  error: null,
  loadingTimedOut: false,
};

vi.mock('@/hooks/useNews', () => ({
  useNews: () => ({
    articles: newsState.articles,
    sources: [],
    categories: [],
    articleTags: {},
    loading: newsState.loading,
    error: newsState.error,
    fetchArticles: fetchArticlesMock,
    fetchTagsForArticles: vi.fn(),
    incrementViews: vi.fn(),
    getFeaturedArticles: vi.fn().mockResolvedValue([]),
    getTrendingTags: vi.fn().mockResolvedValue([]),
    loadingTimedOut: newsState.loadingTimedOut,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => ({ data: [], error: null }) }),
    }),
  },
}));

vi.mock('@/components/news/NewsCard', () => ({
  NewsCard: ({ loading }: { loading?: boolean }) =>
    loading ? <div data-testid="news-skeleton" /> : <div data-testid="news-card" />,
}));

vi.mock('@/components/news/NewsFilters', () => ({
  NewsFilters: () => <div data-testid="news-filters" />,
}));

vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/animation/StaggerGrid', () => ({
  StaggerGrid: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import News from '../News';

describe('News page empty states', () => {
  beforeEach(() => {
    fetchArticlesMock.mockReset();
    newsState.articles = [];
    newsState.loading = false;
    newsState.error = null;
    newsState.loadingTimedOut = false;
  });

  it('renders baseline empty state with Refresh primary CTA when no filters active', async () => {
    const { container } = renderWithProviders(<News />);
    expect(await screen.findByText('The newsroom is quiet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear All/i })).not.toBeInTheDocument();
    expectNoPlaceholderLeaks(container);
  });

  it('renders filtered empty state with primary Clear All CTA that clears filters', async () => {
    const { container } = renderWithProviders(<News />);
    const searchInputs = await screen.findAllByRole('textbox');
    fireEvent.change(searchInputs[0], { target: { value: 'zzzzzz' } });

    await waitFor(() =>
      expect(screen.getByText(/No news matches your filters/i)).toBeInTheDocument(),
    );
    // The filtered empty state exposes a primary CTA that clears the active
    // filters. The current copy is "Reset filters" (see News.tsx's EmptyState
    // primaryAction). We match it loosely so a future copy change to
    // "Clear all" / "Clear filters" won't re-break this test.
    const clearButtons = screen.getAllByRole('button', {
      name: /Reset filters|Clear (all|filters)/i,
    });
    expect(clearButtons.length).toBeGreaterThanOrEqual(1);
    expectNoPlaceholderLeaks(container);

    fireEvent.click(clearButtons[0]);
    await waitFor(() => expect(fetchArticlesMock).toHaveBeenCalled());
  });
});
