import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/useEditorsPick', () => ({ useEditorsPick: () => null }));
vi.mock('@/hooks/useNewsStories', () => ({ useNewsStories: () => ({ stories: [], heroes: [] }) }));
vi.mock('@/hooks/useEntityImageAssets', () => ({ useEntityImageAssets: () => ({ assets: new Map() }) }));

vi.mock('@/hooks/useNews', () => ({
  useNews: () => ({
    articles: [],
    sources: [],
    categories: [],
    articleTags: {},
    loading: false,
    error: null,
    fetchArticles: vi.fn(),
    fetchTagsForArticles: vi.fn(),
    incrementViews: vi.fn(),
    getFeaturedArticles: vi.fn().mockResolvedValue([]),
    getTrendingTags: vi.fn().mockResolvedValue([]),
    loadingTimedOut: false,
  }),
}));

// Mock all editorial components so tests don't need their deps
vi.mock('@/components/news/editorial/IssueMasthead', () => ({
  IssueMasthead: ({ totalArticles }: { totalArticles: number }) => (
    <div data-testid="issue-masthead" data-total={totalArticles} />
  ),
}));
vi.mock('@/components/news/editorial/LeadStory', () => ({ LeadStory: () => null }));
vi.mock('@/components/news/editorial/AboveTheFold', () => ({ AboveTheFold: () => null }));
vi.mock('@/components/news/editorial/LiveTicker', () => ({ LiveTicker: () => null }));
vi.mock('@/components/news/editorial/SectionBand', () => ({ SectionBand: () => null }));
vi.mock('@/components/news/editorial/StoryCollectionsBand', () => ({
  StoryCollectionsBand: () => null,
}));
vi.mock('@/components/news/editorial/WeekInReview', () => ({ WeekInReview: () => null }));
vi.mock('@/components/news/editorial/ReaderRail', () => ({ ReaderRail: () => null }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

import News from '../News';

describe('News page', () => {
  it('renders without crashing when articles list is empty', () => {
    renderWithProviders(<News />);
    expect(screen.getByTestId('issue-masthead')).toBeInTheDocument();
  });

  it('passes article count of 0 to masthead when no articles', () => {
    renderWithProviders(<News />);
    expect(screen.getByTestId('issue-masthead')).toHaveAttribute('data-total', '0');
  });
});
