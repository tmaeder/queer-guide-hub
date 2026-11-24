/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expectNoNestedInteractive } from '@/test/test-utils';

const state = vi.hoisted(() => ({
  me: null as Record<string, unknown> | null,
  cards: [] as Record<string, unknown>[],
  liked: [] as string[],
  matches: [] as { other_id: string }[],
  ranked: [] as { userId: string; score: number; shared: Record<string, number> }[],
}));

vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: () => ({ data: state.me, isLoading: false }),
  useIntimateDiscovery: () => ({ data: state.cards, isLoading: false }),
}));

// useIntimateMatches reaches useAuth (via useMyIntimateLikes); mock it so the
// component renders without an AuthProvider, mirroring the profile-hook mock.
vi.mock('@/hooks/useIntimateMatches', () => ({
  useIntimateMatches: () => ({ data: state.matches }),
  useMyIntimateLikes: () => ({ data: state.liked }),
  useMyIntimatePasses: () => ({ data: [] }),
  useLikeTarget: () => ({ mutate: vi.fn(), isPending: false }),
  usePassTarget: () => ({ mutate: vi.fn(), isPending: false }),
  useIncomingLikeListener: () => {},
}));
vi.mock('@/hooks/usePeopleDiscovery', () => ({
  usePeopleDiscovery: () => ({ data: state.ranked }),
}));
vi.mock('@/hooks/useHankySignals', () => ({
  useMyHankySignals: () => ({ data: {} }),
  useHankyVariants: () => ({ data: [] }),
}));
vi.mock('@/hooks/useKinkTaxonomy', () => ({
  useKinkTaxonomy: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useNearMe', () => ({ useNearMe: () => ({ liveStatus: null }) }));
vi.mock('@/components/people/LivePresenceControl', () => ({ LivePresenceControl: () => null }));

import IntimateDiscovery from '../IntimateDiscovery';

const card = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  user_id: id,
  display_name: name,
  avatar_url: null,
  discovery_city_id: null,
  role: ['vers'],
  into_tags: [],
  body_type: null,
  age_band: '30-34',
  height_cm: null,
  last_active_at: '2020-01-01T00:00:00Z',
  ...extra,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <IntimateDiscovery embedded />
    </MemoryRouter>,
  );

beforeEach(() => {
  state.me = { id: 'me', opted_in_at: '2026-01-01' };
  state.cards = [];
  state.liked = [];
  state.matches = [];
  state.ranked = [];
});

describe('IntimateDiscovery', () => {
  it('asks a member who is not opted in to get started', () => {
    state.me = null;
    renderPage();
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument();
  });

  it('shows people as tiles that open the dating tab, with a like button each', () => {
    state.cards = [card('a', 'Sam'), card('b', 'Kai'), card('c', 'Lio')];
    state.liked = ['b'];
    state.matches = [{ other_id: 'c' }];
    state.ranked = [{ userId: 'a', score: 42, shared: {} }];
    const { container } = renderPage();

    expect(screen.getByText('3 people')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sam' }).getAttribute('href')).toBe('/user/a/dating');
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Like Sam' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Liked Kai' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Lio/ })).toBeNull();
    expect(screen.getByText('Match')).toBeInTheDocument();
    expectNoNestedInteractive(container);
  });

  it('marks members active in the last half hour', () => {
    state.cards = [card('a', 'Sam', { last_active_at: new Date().toISOString() })];
    renderPage();
    expect(screen.getByText('Active now')).toBeInTheDocument();
  });
});
