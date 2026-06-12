/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';
import { Route, Routes } from 'react-router';

const mockProfileState: {
  profile: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  isOwnProfile: boolean;
} = { profile: null, loading: false, error: null, isOwnProfile: false };

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useSecurePublicProfile', () => ({
  useSecurePublicProfile: () => mockProfileState,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import UserProfile from '../UserProfile';

function renderProfile(route = '/users/u2') {
  return renderWithProviders(
    <Routes><Route path="/users/:userId" element={<UserProfile />} /></Routes>,
    { route },
  );
}

describe('UserProfile', () => {
  it('renders without crashing', () => {
    mockProfileState.profile = null;
    const { container } = renderProfile('/users/u1');
    expect(container).toBeTruthy();
  });

  it('shows the friends-only lock screen for a locked stub', () => {
    mockProfileState.profile = {
      user_id: 'u2',
      display_name: 'Sam',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00Z',
      profile_visibility: 'friends',
      locked: true,
    };
    const { getByText, queryByText } = renderProfile();
    expect(getByText('This profile is only visible to friends.')).toBeTruthy();
    expect(queryByText('Joined January 1, 2026')).toBeNull();
  });

  it('blocks rendering of private profiles for other viewers', () => {
    mockProfileState.profile = {
      user_id: 'u2',
      display_name: 'Sam',
      created_at: '2026-01-01T00:00:00Z',
      profile_visibility: 'private',
    };
    const { getByText } = renderProfile();
    expect(getByText('Private Profile')).toBeTruthy();
  });
});
