/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';
import { Route, Routes } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useSecurePublicProfile', () => ({
  useSecurePublicProfile: () => ({ profile: null, loading: false, error: null, isOwnProfile: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useStatus', () => ({ useStatus: () => ({ status: null }) }));
vi.mock('@/hooks/usePublicStatus', () => ({ usePublicStatus: () => ({ status: null }) }));
vi.mock('@/hooks/useCommunityScore', () => ({ useCommunityScore: () => ({ data: null }) }));
vi.mock('@/hooks/usePublicCommunityScore', () => ({ usePublicCommunityScore: () => ({ score: null }) }));

import ProfilePage from '../ProfilePage';

describe('ProfilePage', () => {
  it('renders not-found state without crashing', () => {
    const { container } = renderWithProviders(
      <Routes><Route path="/user/:userId/:tab?" element={<ProfilePage />} /></Routes>,
      { route: '/user/u1' },
    );
    expect(container.textContent).toContain('Profile not found');
  });
});
