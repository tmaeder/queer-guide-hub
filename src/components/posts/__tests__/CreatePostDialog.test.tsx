/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: { display_name: 'A', avatar_url: null } }) }));
vi.mock('@/hooks/useCommunityPosts', () => ({ useCommunityPosts: () => ({ createPost: vi.fn(), isCreatingPost: false }) }));

import { CreatePostDialog } from '../CreatePostDialog';

describe('CreatePostDialog', () => {
  it('renders', () => {
    const { container } = render(<CreatePostDialog />);
    expect(container).toBeTruthy();
  });
});
