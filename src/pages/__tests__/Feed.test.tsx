/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/posts/PostCard', () => ({ PostCard: () => null }));
vi.mock('@/components/posts/CreatePostDialog', () => ({ CreatePostDialog: () => null }));
vi.mock('@/hooks/useCommunityPosts', () => ({
  useCommunityPosts: () => ({
    posts: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    likePost: vi.fn(),
    unlikePost: vi.fn(),
    deletePost: vi.fn(),
    isLikingPost: false,
    isDeletingPost: false,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/components/layout/PageLoadingState', () => ({ PageLoadingState: () => null }));
// FollowedTagsFeed pulls in useQuery; this test renders Feed without a
// QueryClientProvider, so stub it out (it self-hides for anon users anyway).
vi.mock('@/components/tags/FollowedTagsFeed', () => ({ FollowedTagsFeed: () => null }));

import Feed from '../Feed';

describe('Feed', () => {
  it('renders without crashing for anonymous users', () => {
    const { container } = render(
      <MemoryRouter>
        <Feed />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
