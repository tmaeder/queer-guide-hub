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

const { useNewsMock } = vi.hoisted(() => {
  const useNewsMock = vi.fn();
  return { useNewsMock };
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
    expect(
      screen.getByPlaceholderText('Quick search articles...'),
    ).toBeInTheDocument();
  });

  it('shows "The newsroom is quiet" empty state when no articles and no active filters', () => {
    renderWithProviders(<NewsArchive />);
    expect(screen.getByText('The newsroom is quiet')).toBeInTheDocument();
  });

  it('shows "Clear all filters" button when search param is active and articles are present', () => {
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
    renderWithProviders(<NewsArchive />, { route: '/news/archive?q=test' });
    expect(
      screen.getByRole('button', { name: /clear all filters/i }),
    ).toBeInTheDocument();
  });
});
