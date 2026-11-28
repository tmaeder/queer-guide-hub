/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { fetchStoryMock } = vi.hoisted(() => ({ fetchStoryMock: vi.fn() }));

vi.mock('@/hooks/useNewsStories', () => ({ fetchStoryBySlug: fetchStoryMock }));
vi.mock('@/components/layout/PageLoadingState', () => ({
  PageLoadingState: () => <div data-testid="loading" />,
}));
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: (p: { title: string }) => <div>{p.title}</div>,
}));
vi.mock('@/components/news/StorySummaryEditor', () => ({ StorySummaryEditor: () => null }));
vi.mock('@/utils/safeDisplay', () => ({ safeText: (s: string) => s }));
vi.mock('@/utils/htmlDecode', () => ({ decodeHtmlEntities: (s: string) => s }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import NewsStoryDetail from '../NewsStoryDetail';

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/news/story/${slug}`]}>
      <Routes>
        <Route path="/news/story/:slug" element={<NewsStoryDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => fetchStoryMock.mockReset());

describe('NewsStoryDetail', () => {
  it('shows loading state initially', async () => {
    let resolve: (v: null) => void = () => {};
    fetchStoryMock.mockReturnValue(
      new Promise<null>((r) => {
        resolve = r;
      }),
    );
    renderAt('p1');
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    resolve(null);
    await waitFor(() => expect(screen.getByText(/Story not found/)).toBeInTheDocument());
  });

  it('renders not-found state when story null', async () => {
    fetchStoryMock.mockResolvedValue(null);
    renderAt('missing');
    await waitFor(() => expect(screen.getByText(/Story not found/)).toBeInTheDocument());
  });

  it('noindexes a missing story instead of leaving "Story" indexable with no robots tag', async () => {
    fetchStoryMock.mockResolvedValue(null);
    renderAt('missing');
    await waitFor(() => {
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex,nofollow',
      );
    });
  });

  it('starts with the first report, shows the latest, publishers, and folds aggregator copies', async () => {
    fetchStoryMock.mockResolvedValue({
      title: 'Pride 2026',
      article_count: 4,
      first_seen_at: '2026-05-01',
      last_updated_at: '2026-05-15',
      summary: 'lots happened',
      hero_article_id: 'a2',
      articles: [
        {
          id: 'a3',
          slug: 'a-3',
          title: 'Later angle',
          url: 'https://c.org/3',
          publisher_name: 'C Times',
          image_url: 'https://c.org/x.jpg',
          published_at: '2026-05-15T10:00:00Z',
        },
        {
          id: 'a2',
          slug: 'a-2',
          title: 'Middle report',
          url: 'https://b.org/2',
          publisher_name: 'B News',
          image_url: null,
          published_at: '2026-05-14T10:00:00Z',
        },
        {
          id: 'g1',
          slug: 'g-1',
          title: 'First report - A Daily',
          url: 'https://news.google.com/rss/articles/x',
          publisher_name: 'Google News',
          image_url: null,
          published_at: '2026-05-13T11:00:00Z',
        },
        {
          id: 'a1',
          slug: 'a-1',
          title: 'First report',
          url: 'https://a.org/1',
          publisher_name: 'A Daily',
          image_url: null,
          published_at: '2026-05-13T10:00:00Z',
        },
      ],
    });
    renderAt('pride-2026');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Pride 2026' })).toBeInTheDocument(),
    );
    expect(screen.getByText('lots happened')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start here First report/ })).toHaveAttribute(
      'href',
      '/news/a-1',
    );
    expect(screen.getByRole('link', { name: /Latest development Later angle/ })).toHaveAttribute(
      'href',
      '/news/a-3',
    );
    expect(screen.getByRole('link', { name: /Middle report/ })).toHaveAttribute(
      'href',
      '/news/a-2',
    );
    expect(screen.queryByRole('link', { name: /First report - A Daily/ })).toBeNull();
    expect(screen.getByText(/Also listed by/)).toBeInTheDocument();
    expect(screen.getByText(/^Coverage from/)).toBeInTheDocument();
    expect(screen.queryByText(/orroborat/)).toBeNull();
  });
});
