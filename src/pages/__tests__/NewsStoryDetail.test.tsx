/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { fetchStoryMock } = vi.hoisted(() => ({ fetchStoryMock: vi.fn() }));

vi.mock('@/hooks/useNewsStories', () => ({ fetchStoryBySlug: fetchStoryMock }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/components/layout/PageLoadingState', () => ({
  PageLoadingState: () => <div data-testid="loading" />,
}));
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: (p: { title: string }) => <div>{p.title}</div>,
}));
vi.mock('@/utils/safeDisplay', () => ({ safeText: (s: string) => s }));
vi.mock('@/utils/htmlDecode', () => ({ decodeHtmlEntities: (s: string) => s }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import NewsStoryDetail from '../NewsStoryDetail';

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/news/story/${slug}`]}>
      <Routes><Route path="/news/story/:slug" element={<NewsStoryDetail />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => fetchStoryMock.mockReset());

describe('NewsStoryDetail', () => {
  it('shows loading state initially', async () => {
    let resolve: (v: null) => void = () => {};
    fetchStoryMock.mockReturnValue(new Promise<null>((r) => { resolve = r; }));
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

  it('renders story title + article list', async () => {
    fetchStoryMock.mockResolvedValue({
      title: 'Pride 2026',
      article_count: 3,
      first_seen_at: '2026-05-01',
      last_updated_at: '2026-05-15',
      summary: 'lots happened',
      articles: [{ id: 'a1', slug: 'a-1', title: 'Coverage A', image_url: null, published_at: '2026-05-15' }],
    });
    renderAt('pride-2026');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Pride 2026' })).toBeInTheDocument());
    expect(screen.getByText('Coverage A')).toBeInTheDocument();
    expect(screen.getByText(/3 articles/)).toBeInTheDocument();
  });
});
