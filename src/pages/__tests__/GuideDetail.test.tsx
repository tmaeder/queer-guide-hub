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
vi.mock('@/components/share/ShareMenu', () => ({ ShareMenu: () => null }));
vi.mock('@/components/admin/AdminEditButton', () => ({
  AdminEditButton: (p: { contentType: string; contentId: string; exportable?: boolean }) => (
    <span
      data-testid="admin-edit"
      data-type={p.contentType}
      data-id={p.contentId}
      data-exportable={String(Boolean(p.exportable))}
    />
  ),
}));

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

describe('GuideDetail — admin menu', () => {
  it('opts the guide admin menu into the record export', async () => {
    useGuideMock.mockReturnValue({
      data: {
        guide: {
          id: 'g1',
          format: 'guide',
          slug: 'berlin',
          title: 'Berlin',
          dek: null,
          intro_md: null,
          hero_image_path: null,
          category: null,
          primary_entity_type: null,
          city_id: null,
          audience_tags: [],
          status: 'published',
          starts_at: null,
          ends_at: null,
          criteria: {},
          recap_article_id: null,
          published_at: null,
          reading_time_min: null,
          pick_count: 0,
          review_due_at: null,
          is_featured: false,
          safety_gated: false,
          meta: {},
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        picks: [],
        sections: [],
      },
      isLoading: false,
      error: null,
    });
    renderAt('berlin');
    const btn = await screen.findByTestId('admin-edit');
    expect(btn).toHaveAttribute('data-type', 'guides');
    expect(btn).toHaveAttribute('data-id', 'g1');
    expect(btn).toHaveAttribute('data-exportable', 'true');
  });
});
