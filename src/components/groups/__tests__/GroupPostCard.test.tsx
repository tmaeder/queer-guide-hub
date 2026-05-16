/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GroupPostCard } from '../GroupPostCard';

const post = {
  id: 'p1',
  content: 'hi',
  post_type: 'text',
  user_id: 'u1',
  created_at: new Date().toISOString(),
  likes_count: 0,
  user_liked: false,
  user: { username: 'a', display_name: 'A' },
} as never;

describe('GroupPostCard', () => {
  it('renders', () => {
    const { container } = render(
      <GroupPostCard post={post} onLike={vi.fn()} onUnlike={vi.fn()} onVote={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
