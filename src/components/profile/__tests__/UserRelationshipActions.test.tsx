/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useUserRelationships', () => ({
  useUserRelationships: () => ({
    getRelationship: () => null,
    getRelationshipStatus: () => null,
    sendFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    rejectFriendRequest: vi.fn(),
    removeRelationship: vi.fn(),
    blockUser: vi.fn(),
    loading: false,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { UserRelationshipActions } from '../UserRelationshipActions';

describe('UserRelationshipActions', () => {
  it('renders', () => {
    const { container } = render(<UserRelationshipActions targetUserId="u2" />);
    expect(container).toBeTruthy();
  });
});
