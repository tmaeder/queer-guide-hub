/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { PostCard } from '../PostCard';

const post = {
  id: 'p1',
  content: 'hi',
  user_id: 'u2',
  created_at: new Date().toISOString(),
  likes_count: 0,
  user_liked: false,
  user: { username: 'a', display_name: 'A', avatar_url: null },
} as never;

describe('PostCard', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><PostCard post={post} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
