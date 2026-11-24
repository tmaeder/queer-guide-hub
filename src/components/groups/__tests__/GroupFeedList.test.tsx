/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const state = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }),
}));
vi.mock('@/hooks/useGroupPosts', () => ({
  useMyGroupsFeed: () => ({ data: state.data, isLoading: false }),
}));

import { GroupFeedList } from '../GroupFeedList';

const post = (id: string, content: string) => ({
  id,
  group_id: 'g1',
  content,
  post_type: 'text',
  created_at: '2026-11-20T10:00:00Z',
  group_name: 'Queer Book Club',
  author_name: 'Alex',
  author_avatar: null,
});

const renderList = (searchTerm = '') =>
  render(
    <MemoryRouter>
      <GroupFeedList searchTerm={searchTerm} />
    </MemoryRouter>,
  );

describe('GroupFeedList', () => {
  it('opens each post in its group', () => {
    state.data = [post('p1', 'Next book: Giovanni’s Room')];
    renderList();
    expect(screen.getByText('Next book: Giovanni’s Room')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open in group' }).getAttribute('href')).toBe(
      '/meet/groups/g1?post=p1',
    );
    expect(screen.getByRole('link', { name: 'Queer Book Club' }).getAttribute('href')).toBe(
      '/meet/groups/g1',
    );
  });
  it('filters by the feed search', () => {
    state.data = [post('p1', 'Giovanni'), post('p2', 'Orlando')];
    renderList('orlando');
    expect(screen.queryByText('Giovanni')).toBeNull();
    expect(screen.getByText('Orlando')).toBeTruthy();
  });
  it('points to groups when there are no posts', () => {
    state.data = [];
    renderList();
    expect(screen.getByText('No posts in your groups yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Find groups' }).getAttribute('href')).toBe(
      '/meet/groups',
    );
  });
});
