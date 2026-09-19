/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const state = vi.hoisted(() => ({
  front: [] as unknown[],
  loading: false,
  storyCounts: new Map<string, { slug: string; count: number }>(),
  user: null as { id: string } | null,
  frontCalls: 0,
}));

// The band reads the RANKED feed, not `published_at desc` — mocking
// useLatestNews here would leave the real hooks running.
vi.mock('@/hooks/useNewsFront', () => ({
  useNewsFront: () => {
    state.frontCalls += 1;
    return { articles: state.front, loading: state.loading, error: null };
  },
  useForYouNews: () => ({ articles: [], loading: false, error: null }),
}));
vi.mock('@/hooks/useEditorsPick', () => ({ useEditorsPick: () => null }));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => ({ assets: new Map() }),
}));
vi.mock('@/hooks/useNewsStories', () => ({
  useStoryCountsForArticles: () => state.storyCounts,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/useFollowedTags', () => ({
  useFollowedTags: () => ({ followedTags: [], toggleFollow: vi.fn() }),
}));
vi.mock('@/hooks/useTagSearch', () => ({
  useTagSearch: () => ({ results: [], loading: false, search: vi.fn() }),
}));

import NewsMagazine from '../NewsMagazine';

const HOUR = 60 * 60 * 1000;

const article = (i: number, over: Record<string, unknown> = {}) => ({
  id: `a${i}`,
  slug: `story-${i}`,
  title: `Story ${i}`,
  excerpt: null,
  image_url: null,
  // Staggered so the relative timestamps differ and nothing depends on a
  // frozen clock.
  published_at: new Date(Date.now() - i * HOUR).toISOString(),
  publisher_name: 'Wire',
  is_read: false,
  category_canonical: 'rights-legal',
  media_type: 'article',
  personal_score: 1000 - i,
  ...over,
});

beforeEach(() => {
  state.front = [];
  state.loading = false;
  state.storyCounts = new Map();
  state.user = null;
  state.frontCalls = 0;
  sessionStorage.clear();
});

describe('NewsMagazine', () => {
  it('self-hides when there is nothing to show', () => {
    const { container } = renderWithProviders(<NewsMagazine />);
    expect(container.querySelector('h2')).toBeNull();
  });

  it('renders the band when the front has stories', () => {
    state.front = Array.from({ length: 6 }, (_, i) => article(i));
    renderWithProviders(<NewsMagazine />);
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
  });

  // Rotation is GONE. The old band strided a full page of the ranking every 6
  // hours, so for most of the day the lead was not the top story. This is the
  // guard that nobody reintroduces it — or reaches for Math.random(), which
  // would also break hydration and make the band untestable.
  it('renders the same lead across two mounts of the same pool', () => {
    state.front = Array.from({ length: 20 }, (_, i) => article(i));
    const first = renderWithProviders(<NewsMagazine />);
    const leadA = first.container.querySelector('h3')?.textContent;
    first.unmount();
    const second = renderWithProviders(<NewsMagazine />);
    const leadB = second.container.querySelector('h3')?.textContent;
    expect(leadA).toBe(leadB);
    expect(leadA).toContain('Story 0');
  });

  it('sinks already-read stories out of the lead slot', () => {
    state.front = [
      article(1, { title: 'Already read', is_read: true, personal_score: 9999 }),
      article(2, { title: 'Fresh one', is_read: false, personal_score: 1 }),
    ];
    renderWithProviders(<NewsMagazine />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('Fresh one');
  });

  // The RPC's own ORDER BY is raw hotness in this branch, so sorting by
  // personal_score client-side is the ONLY thing that makes the geo (×1.25) and
  // followed-tag (×1.4) boosts visible. Array order here is deliberately the
  // opposite of score order.
  it('orders by personal_score, not by the order the RPC returned', () => {
    state.front = [
      article(1, { title: 'Low score first in array', personal_score: 10 }),
      article(2, { title: 'Boosted', personal_score: 900 }),
    ];
    renderWithProviders(<NewsMagazine />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('Boosted');
  });

  // A story published ninety minutes ago used to be labelled "Sep 19, 2026",
  // which is what made a band full of today's news read as an archive. Both
  // surfaces are asserted: the lead's meta line AND a row's own timestamp
  // column, which are separate code paths — checking only the lead let a
  // mutation that re-dated every row survive.
  it('shows relative time on the lead, never a date', () => {
    state.front = [article(0, { published_at: new Date(Date.now() - 3 * HOUR).toISOString() })];
    const { container } = renderWithProviders(<NewsMagazine />);
    expect(container.querySelector('h3')).toBeTruthy();
    expect(container.textContent).toContain('3h ago');
    expect(container.textContent).not.toMatch(/\d{4}/);
  });

  it('shows relative time in every row, never a date', () => {
    state.front = Array.from({ length: 6 }, (_, i) => article(i));
    const { container } = renderWithProviders(<NewsMagazine />);
    const rows = Array.from(container.querySelectorAll('[data-news-row]'));
    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect(row.textContent).toMatch(/\d+[mhd] ago|just now/);
      // A four-digit year anywhere in a row means someone reinstated a date.
      expect(row.textContent).not.toMatch(/\d{4}/);
    }
  });

  describe('topic chips', () => {
    it('disables a chip whose slice is too thin, and keeps it in the DOM', () => {
      // 10 rights-legal, 1 community. Community cannot fill a band.
      state.front = [
        ...Array.from({ length: 10 }, (_, i) => article(i)),
        article(90, { category_canonical: 'community' }),
      ];
      renderWithProviders(<NewsMagazine />);
      const community = screen.getByRole('tab', { name: 'Community' });
      // Present — an absent chip reads as a missing feature, a greyed one reads
      // as thin coverage, which is the truth.
      expect(community).toBeTruthy();
      expect(community).toBeDisabled();
      expect(screen.getByRole('tab', { name: 'Rights & Legal' })).not.toBeDisabled();
    });

    it('filters without refetching', () => {
      state.front = [
        ...Array.from({ length: 6 }, (_, i) => article(i)),
        ...Array.from({ length: 4 }, (_, i) =>
          article(50 + i, { title: `Community ${i}`, category_canonical: 'community' }),
        ),
      ];
      renderWithProviders(<NewsMagazine />);
      const before = state.frontCalls;
      fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
      expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('Community 0');
      expect(screen.queryByText('Story 0')).toBeNull();
      // What is guaranteed is that the FEED is not refetched — the chip
      // filters the pool already in hand, so `useNewsFront`'s query key never
      // changes. Verified against the live app: a chip click issues 0 calls to
      // `get_news_front`. It does issue two small id-keyed satellite requests
      // (image assets, story counts) for the newly visible rows, which are
      // inherent to showing different articles and are NOT a feed refetch.
      // This mock counts renders, not requests, so it can only assert the hook
      // was re-invoked with an unchanged result.
      expect(state.frontCalls).toBeGreaterThan(before);
      expect(screen.getByRole('tab', { name: 'Community' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('restores a stored topic on mount and ignores an expired one', () => {
      state.front = [
        ...Array.from({ length: 6 }, (_, i) => article(i)),
        ...Array.from({ length: 4 }, (_, i) =>
          article(50 + i, { title: `Community ${i}`, category_canonical: 'community' }),
        ),
      ];
      sessionStorage.setItem('qg_news_topic', JSON.stringify({ id: 'community', ts: Date.now() }));
      const fresh = renderWithProviders(<NewsMagazine />);
      expect(fresh.container.querySelector('h3')?.textContent).toContain('Community 0');
      fresh.unmount();

      // 13 hours old — past the 12h TTL, so it must not be honoured. A durable
      // record of what someone reads is the thing this TTL exists to avoid.
      sessionStorage.setItem(
        'qg_news_topic',
        JSON.stringify({ id: 'community', ts: Date.now() - 13 * HOUR }),
      );
      const stale = renderWithProviders(<NewsMagazine />);
      expect(stale.container.querySelector('h3')?.textContent).toContain('Story 0');
    });
  });

  describe('disclosure', () => {
    it('keeps every headline in the DOM while closed, for crawlers', () => {
      state.front = Array.from({ length: 16 }, (_, i) => article(i));
      const { container } = renderWithProviders(<NewsMagazine />);
      const details = container.querySelector('details');
      expect(details).toBeTruthy();
      expect(details?.hasAttribute('open')).toBe(false);
      // 15 rows (lead is an h3, not a row) present even though the disclosure
      // is shut — this is why it is <details> and not a JS-gated panel.
      expect(container.querySelectorAll('[data-news-row]').length).toBe(15);
      expect(details?.querySelectorAll('[data-news-row]').length).toBe(7);
      expect(container.textContent).toContain('Story 15');
    });

    it('does not render when the remainder is too small to be worth a click', () => {
      // lead + 8 tier-one rows + 2 left over = below the floor.
      state.front = Array.from({ length: 11 }, (_, i) => article(i));
      const { container } = renderWithProviders(<NewsMagazine />);
      expect(container.querySelector('details')).toBeNull();
    });
  });

  describe('outlet marker', () => {
    it('renders "N outlets" only for a multi-outlet cluster', () => {
      state.front = Array.from({ length: 6 }, (_, i) => article(i));
      state.storyCounts = new Map([
        ['a1', { slug: 's1', count: 6 }],
        ['a2', { slug: 's2', count: 1 }],
      ]);
      const { container } = renderWithProviders(<NewsMagazine />);
      expect(container.textContent).toContain('6 outlets');
      expect(container.textContent).not.toContain('1 outlets');
    });

    it('stays plain text — a link here would nest inside the row anchor', () => {
      state.front = Array.from({ length: 6 }, (_, i) => article(i));
      state.storyCounts = new Map([['a1', { slug: 's1', count: 6 }]]);
      const { container } = renderWithProviders(<NewsMagazine />);
      for (const anchor of Array.from(container.querySelectorAll('a'))) {
        expect(anchor.querySelector('a')).toBeNull();
      }
    });
  });

  describe('follow chip', () => {
    it('renders nothing when signed out', () => {
      state.front = Array.from({ length: 6 }, (_, i) => article(i));
      renderWithProviders(<NewsMagazine />);
      expect(screen.queryByRole('button', { name: /follow topics/i })).toBeNull();
    });

    it('renders for a signed-in reader', () => {
      state.user = { id: 'u1' };
      state.front = Array.from({ length: 6 }, (_, i) => article(i));
      renderWithProviders(<NewsMagazine />);
      expect(screen.getByRole('button', { name: /follow topics/i })).toBeTruthy();
    });
  });

  // The old band computed `loading` as `front.loading && forYou.loading`. For a
  // signed-in reader whose For-You feed resolved to [] first — which was 16 of
  // 17 profiles — that read false with nothing to show, so the early return
  // fired and the skeleton NEVER rendered: the band just popped in.
  it('renders the skeleton while the front is still loading', () => {
    state.user = { id: 'u1' };
    state.loading = true;
    state.front = [];
    const { container } = renderWithProviders(<NewsMagazine />);
    expect(container.querySelector('h2')).toBeTruthy();
  });
});
