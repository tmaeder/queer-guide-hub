import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderWithProviders, screen } from '@/test/test-utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
// The bands below the fold mount on IntersectionObserver, which never fires in
// jsdom; render them straight away so the band assertions see the real tree.
vi.mock('@/components/home/DeferredSection', () => ({
  DeferredSection: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/hooks/useEditorsPick', () => ({ useEditorsPick: () => null }));
vi.mock('@/hooks/useNewsStories', () => ({ useNewsStories: () => ({ stories: [], heroes: [] }) }));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => ({ assets: new Map() }),
}));

const newsState = vi.hoisted(() => ({ loading: false }));
vi.mock('@/hooks/useNews', () => ({
  useNewsArticles: () => ({
    articles: [],
    loading: newsState.loading,
    error: null,
    refetch: vi.fn(),
  }),
  incrementArticleViews: vi.fn(),
  useNewsSources: () => [],
  useNewsCategories: () => [],
  useNewsCategoryCounts: () => ({ categoryCounts: {}, totalArticles: 0 }),
}));

// Mock all editorial components so tests don't need their deps
vi.mock('@/components/news/editorial/IssueMasthead', () => ({
  IssueMasthead: () => <div data-testid="issue-masthead" />,
}));
vi.mock('@/components/news/editorial/LeadStory', () => ({ LeadStory: () => null }));
vi.mock('@/components/news/editorial/AboveTheFold', () => ({ AboveTheFold: () => null }));
vi.mock('@/components/news/editorial/SectionBand', () => ({ SectionBand: () => null }));
vi.mock('@/components/news/editorial/StoryCollectionsBand', () => ({
  StoryCollectionsBand: () => null,
}));
vi.mock('@/components/news/editorial/WeekInReview', () => ({ WeekInReview: () => null }));
// DeferredSection waits for an IntersectionObserver hit jsdom never delivers;
// render below-the-fold bands immediately so the archive band is testable.
vi.mock('@/components/home/DeferredSection', () => ({
  DeferredSection: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/news/editorial/ReaderRail', () => ({ ReaderRail: () => null }));
// ForYouSection calls useForYouNews → useAuth; mock it out like its siblings so
// the page renders without an AuthProvider tree (and survives the full suite).
vi.mock('@/components/news/editorial/ForYouSection', () => ({ ForYouSection: () => null }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

import News from '../News';

describe('News page', () => {
  it('renders without crashing when articles list is empty', () => {
    renderWithProviders(<News />);
    expect(screen.getByTestId('issue-masthead')).toBeInTheDocument();
  });

  // The archive band is the last thing on the page. While the feed above it
  // loads it would sit in a phone's first viewport and then be pushed down — a
  // 0.48 layout shift on /news (Lighthouse mobile). It renders once loaded.
  it('holds the archive band back while the feed is loading', () => {
    newsState.loading = true;
    renderWithProviders(<News />);
    // Positive control: the page rendered, so the absence below is not an empty tree.
    expect(screen.getByTestId('issue-masthead')).toBeInTheDocument();
    expect(screen.queryByText('Every story we have ever told.')).toBeNull();
    newsState.loading = false;
  });

  it('shows the archive band once the feed has loaded', () => {
    newsState.loading = false;
    // The lower bands mount on approach (DeferredSection); the shared jsdom
    // stub never intersects, so report the section as on screen.
    const saved = window.IntersectionObserver;
    window.IntersectionObserver = class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe() {
        this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
    renderWithProviders(<News />);
    window.IntersectionObserver = saved;
    expect(screen.getByText('Every story we have ever told.')).toBeInTheDocument();
  });
});
