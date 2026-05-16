/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useComments', () => ({
  useComments: () => ({ comments: [], loading: false, addComment: vi.fn(), likeComment: vi.fn(), unlikeComment: vi.fn() }),
}), { virtual: true } as never);
vi.mock('@/hooks/useCommunityPosts', () => ({
  useCommunityPosts: () => ({ comments: [], commentsLoading: false, addComment: vi.fn(), likeComment: vi.fn(), unlikeComment: vi.fn(), loadComments: vi.fn() }),
}));

import { CommentsSection } from '../CommentsSection';

describe('CommentsSection', () => {
  it('renders', () => {
    const { container } = render(<CommentsSection postId="p1" />);
    expect(container).toBeTruthy();
  });
});
