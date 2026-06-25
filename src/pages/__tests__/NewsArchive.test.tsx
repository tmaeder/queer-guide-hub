import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';

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
  fetchTagsForArticles: vi.fn(),
  incrementViews: vi.fn(),
  getFeaturedArticles: vi.fn().mockResolvedValue([]),
  getTrendingTags: vi.fn().mockResolvedValue([]),
  loadingTimedOut: false,
  ...overrides,
});

const { useNewsMock, useNewsSearchMock } = vi.hoisted(() => {
  return { useNewsMock: vi.fn(), useNewsSearchMock: vi.fn() };
});

const makeSearchReturn = (overrides = {}) => ({
  articles: [],
  totalHits: 0,
  facets: {},
  loading: false,
  error: null,
  searchArticles: vi.fn(),
  reset: vi.fn(),
  ...overrides,
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useEntityImageAssets', () => ({ useEntityImageAssets: () => ({ assets: new Map() }) }));
vi.mock('@/hooks/useNewsStories', () => ({ useNewsStories: () => ({ stories: [], heroes: [] }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ fetchNamesByIds: vi.fn().mockResolvedValue({}) }));
vi.mock('@/hooks/useNews', () => ({ useNews: useNewsMock }));
// `?q=…` routes through semantic search (useNewsSearch), bypassing useNews; mock it.
vi.mock('@/hooks/useNewsSearch', () => ({ useNewsSearch: useNewsSearchMock }));

vi.mock('@/components/news/NewsCard', () => ({
  NewsCard: ({ loading }: { loading?: boolean }) =>
    loading ? <div data-testid="news-card-skeleton" /> : <div data-testid="news-card" />,
}));
vi.mock('@/components/news/NewsFilters', () => ({ NewsFilters: () => null }));
vi.mock('@/components/news/StoryCard', () => ({ StoryCard: () => null }));
// NewsArchive renders auth-aware side panels (NewsSavedSearchesPanel,
// ReadingHistoryPanel) that call useAuth; renderWithProviders has no
// AuthProvider. Stub the hook (logged-out) so those panels render their no-user
// branch — irrelevant to these filter/search-state assertions.
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
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
  useNewsSearchMock.mockReturnValue(makeSearchReturn());
});

describe('NewsArchive page', () => {
  it('renders without crashing and shows search input', () => {
    renderWithProviders(<NewsArchive />);
    expect(
      screen.getByPlaceholderText('Semantic search articles…'),
    ).toBeInTheDocument();
  });

  it('shows "The newsroom is quiet" empty state when no articles and no active filters', () => {
    renderWithProviders(<NewsArchive />);
    expect(screen.getByText('The newsroom is quiet')).toBeInTheDocument();
  });

  it('shows "Clear all filters" button when search param is active and articles are present', () => {
    const article = {
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
    };
    // `?q=test` (len ≥ 2) renders semantic-search results, not useNews articles.
    useNewsSearchMock.mockReturnValue(makeSearchReturn({ articles: [article], totalHits: 1 }));
    renderWithProviders(<NewsArchive />, { route: '/news/archive?q=test' });
    expect(
      screen.getByRole('button', { name: /clear all filters/i }),
    ).toBeInTheDocument();
  });
});
