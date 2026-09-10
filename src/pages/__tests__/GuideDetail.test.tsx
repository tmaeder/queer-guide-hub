/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const { useGuideMock } = vi.hoisted(() => ({ useGuideMock: vi.fn() }));

vi.mock('@/hooks/useGuides', async (orig) => {
  const actual = await orig<typeof import('../../hooks/useGuides')>();
  return { ...actual, useGuide: useGuideMock };
});
vi.mock('@/hooks/useGuideReadTracker', () => ({ useGuideReadTracker: () => {} }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));

import GuideDetail from '../GuideDetail';

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/guides/${slug}`]}>
      <Routes>
        <Route path="/guides/:slug" element={<GuideDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GuideDetail — SEO', () => {
  it('noindexes an unknown slug instead of shipping the fallback "Guide" title indexable', async () => {
    // The not-found branch (`error || !data`) rendered `EmptyState` with
    // "Guide not found." but `useMeta` was called with the loading-branch
    // shape (`data?.guide?.title ?? 'Guide'` — the fallback title, not the
    // not-found one) and no `noIndex` at all: same soft-404 shape as
    // TagDetail's fix.
    useGuideMock.mockReturnValue({ data: null, isLoading: false, error: null });
    renderAt('dead-slug');
    await screen.findByText(/Guide not found/i);
    await waitFor(() => {
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex,nofollow',
      );
    });
    expect(document.title).not.toMatch(/^Guide \|/);
  });

  it('leaves a loading guide un-noindexed while the fetch is in flight', () => {
    useGuideMock.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderAt('some-guide');
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});
