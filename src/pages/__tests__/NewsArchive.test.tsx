import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';

const makeNewsReturn = (overrides = {}) => ({
  articles: [],
  sources: [],
  categories: [],
  categoryCounts: {},
  articleTags: {},
  totalArticles: 0,
  loading: false,
  error: null,
  fetchArticles: vi.fn(),
  refetch: vi.fn(),
  loadingTimedOut: false,
  ...overrides,
});

const { useNewsMock } = vi.hoisted(() => {
  const useNewsMock = vi.fn();
  return { useNewsMock };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => ({ assets: new Map() }),
}));
vi.mock('@/hooks/useNewsStories', () => ({ useNewsStories: () => ({ stories: [], heroes: [] }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ fetchNamesByIds: vi.fn().mockResolvedValue({}) }));
/** The lazy initial request NewsArchive hands the feed, per render. */
const initialRequests: Array<Record<string, unknown>> = [];
vi.mock('@/hooks/useNews', () => ({
  useNewsArticlesFeed: (initial?: () => Record<string, unknown>) => {
    if (initial) initialRequests.push(initial());
    const r = useNewsMock();
    return {
      articles: r.articles,
      loading: r.loading,
      error: r.error,
      fetchArticles: r.fetchArticles,
      refetch: r.refetch,
      loadingTimedOut: r.loadingTimedOut,
    };
  },
  useNewsSources: () => useNewsMock().sources,
  useNewsCategories: () => useNewsMock().categories,
  useNewsCategoryCounts: () => ({
    categoryCounts: useNewsMock().categoryCounts,
    totalArticles: useNewsMock().totalArticles,
  }),
  useNewsArticleTags: () => useNewsMock().articleTags,
  useFeaturedNewsArticles: () => [],
  useTrendingNewsTags: () => [],
  incrementArticleViews: vi.fn(),
}));

vi.mock('@/components/news/NewsCard', () => ({
  NewsCard: ({ loading }: { loading?: boolean }) =>
    loading ? <div data-testid="news-card-skeleton" /> : <div data-testid="news-card" />,
}));
vi.mock('@/components/news/NewsFilters', () => ({ NewsFilters: () => null }));
vi.mock('@/components/news/StoryCard', () => ({ StoryCard: () => null }));
vi.mock('@/components/discovery', () => ({
  PageHero: () => null,
  spansForPreset: () => ({}),
}));
vi.mock('@/components/animation/StaggerGrid', () => ({
  StaggerGrid: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import NewsArchive from '../NewsArchive';

beforeEach(() => {
  useNewsMock.mockReturnValue(makeNewsReturn());
});

describe('NewsArchive page', () => {
  it('renders without crashing and shows search input', () => {
    renderWithProviders(<NewsArchive />);
    expect(screen.getByPlaceholderText('Semantic search articles…')).toBeInTheDocument();
  });

  it('shows "The newsroom is quiet" empty state when no articles and no active filters', () => {
    renderWithProviders(<NewsArchive />);
    expect(screen.getByText('The newsroom is quiet')).toBeInTheDocument();
  });

  it('shows "Clear all filters" button when a filter is active and articles are present', () => {
    useNewsMock.mockReturnValue(
      makeNewsReturn({
        articles: [
          {
            id: 'a1',
            title: 'Test Article',
            content: null,
            excerpt: null,
            url: 'https://example.com',
            image_url: null,
            author: null,
            published_at: '2026-05-01T00:00:00Z',
            source_id: 's1',
            views_count: 0,
            is_featured: false,
            category: null,
            country_ids: null,
            city_ids: null,
            tags: null,
            publisher_name: null,
            created_at: '2026-05-01T00:00:00Z',
          },
        ],
        totalArticles: 1,
      }),
    );
    // A query >= 2 chars switches to semantic-search mode (its own result list);
    // a category filter keeps the keyword article list visible, which is what
    // the active-filters bar + "Clear all filters" button render against.
    renderWithProviders(<NewsArchive />, { route: '/news/archive?category=culture' });
    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument();
  });

  it('hydrates a durable right filter from the URL and lets the reader clear it', async () => {
    const fetchArticles = vi.fn();
    useNewsMock.mockReturnValue(
      makeNewsReturn({
        fetchArticles,
        articles: [
          {
            id: 'a1',
            slug: 'ban-advances',
            title: 'Ban advances',
            content: 'Body',
            excerpt: null,
            url: 'https://example.com',
            image_url: null,
            author: null,
            published_at: '2026-09-30T00:00:00Z',
            source_id: 's1',
            views_count: 0,
            is_featured: false,
            category: 'rights-legal',
            country_ids: null,
            city_ids: null,
            tags: ['conversion-therapy'],
            publisher_name: null,
            created_at: '2026-09-30T00:00:00Z',
          },
        ],
      }),
    );

    initialRequests.length = 0;
    renderWithProviders(<NewsArchive />, { route: '/news/all?right=conversion-therapy' });

    // The URL's filter is on the FIRST request, not a mount-time correction.
    expect(initialRequests[0]).toEqual(expect.objectContaining({ tags: ['conversion-therapy'] }));
    await waitFor(() => expect(screen.getByText(/Right: Conversion therapy/)).toBeInTheDocument());
    expect(screen.getByText(/Right: Conversion therapy/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Conversion therapy filter' }));
    expect(fetchArticles).toHaveBeenLastCalledWith(expect.objectContaining({ tags: undefined }));
  });

  // Retry used to call fetchArticles() with no arguments, replacing the
  // filtered request with an unfiltered one. It must re-run what is on screen.
  it('retrying a failed filtered archive refetches it instead of dropping the filters', async () => {
    const fetchArticles = vi.fn();
    const refetch = vi.fn();
    useNewsMock.mockReturnValue(
      makeNewsReturn({
        fetchArticles,
        refetch,
        error: 'Failed to load articles. Please try again.',
      }),
    );
    initialRequests.length = 0;
    renderWithProviders(<NewsArchive />, { route: '/news/all?category=politics' });
    // Control: the page really is filtered.
    expect(initialRequests[0]).toEqual(expect.objectContaining({ category: 'politics' }));

    await userEvent.click(screen.getAllByRole('button', { name: /try again|retry/i })[0]);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(fetchArticles).not.toHaveBeenCalled();
  });
});
