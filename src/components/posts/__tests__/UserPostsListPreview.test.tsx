/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ posts: [] as Array<{ id: string }>, isLoading: false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useSocialModeration', () => ({ usePostModeration: () => new Map() }));
vi.mock('@/hooks/useCommunityPosts', () => ({
  useCommunityPosts: () => ({
    ...state,
    likePost: vi.fn(),
    unlikePost: vi.fn(),
    deletePost: vi.fn(),
  }),
}));
vi.mock('../PostCard', () => ({
  PostCard: ({ post }: { post: { id: string } }) => <article>{post.id}</article>,
}));
vi.mock('../CreatePostDialog', () => ({ CreatePostDialog: () => <button>Composer</button> }));

import { UserPostsList } from '../UserPostsList';

describe('UserPostsList preview', () => {
  it('renders nothing, not even the heading, when there are no posts', () => {
    state.posts = [];
    const { container } = render(
      <UserPostsList userId="u1" isOwnProfile limit={2} heading={<h3>Latest</h3>} />,
    );
    expect(container.innerHTML).toBe('');
  });
  it('shows the heading and the newest posts only, without the composer', () => {
    state.posts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    render(<UserPostsList userId="u1" isOwnProfile limit={2} heading={<h3>Latest</h3>} />);
    expect(screen.getByText('Latest')).toBeTruthy();
    expect(screen.getAllByRole('article').map((a) => a.textContent)).toEqual(['a', 'b']);
    expect(screen.queryByText('Composer')).toBeNull();
  });
  it('keeps the composer and every post on the full list', () => {
    render(<UserPostsList userId="u1" isOwnProfile />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('Composer')).toBeTruthy();
  });
});
