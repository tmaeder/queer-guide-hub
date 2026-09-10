/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false, hasPasskey: false,
    signUp: vi.fn(), signIn: vi.fn(), signInWithOAuth: vi.fn(), resendVerification: vi.fn(),
    resetPassword: vi.fn(), signOut: vi.fn(), enrollPasskey: vi.fn(), signInWithPasskey: vi.fn() }),
}));
vi.mock('@/hooks/usePageFetchers', () => ({
  fetchNewsArticleBySlugOrId: vi.fn().mockResolvedValue(null),
  fetchRelatedNews: vi.fn().mockResolvedValue([]),
  fetchNewsCategories: vi.fn().mockResolvedValue([]),
  fetchNewsArticleById: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/hooks/useEntityImageAssets', () => ({ useEntityImageAssets: () => ({ data: {} }) }));
// useUserNewsReads (added in the editorial rebuild) calls useAuth; the test
// renders bare without an AuthProvider, so mock the hook to a no-op.
vi.mock('@/hooks/useUserNewsReads', () => ({
  useUserNewsReads: () => ({ markRead: vi.fn() }),
}));

import NewsDetail from '../NewsDetail';

function renderPage(slug = 'n1') {
  return render(
    <MemoryRouter initialEntries={[`/news/${slug}`]}>
      <Routes><Route path="/news/:slug" element={<NewsDetail />} /></Routes>
    </MemoryRouter>,
  );
}

describe('NewsDetail', () => {
  it('renders without crashing', () => {
    const { container } = renderPage();
    expect(container).toBeTruthy();
  });

  it('noindexes a missing article instead of leaving the default title indexable', async () => {
    // `articleTitle`/canonical/jsonLd were all `undefined` on a missing
    // article and `noIndex` was never set — the default "Queer Guide" title
    // published with a live self-referential canonical, same soft-404 shape
    // as TagDetail's fix.
    renderPage('dead-slug');
    await waitFor(() => {
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex,nofollow',
      );
    });
  });
});
