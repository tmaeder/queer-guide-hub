/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';
import { Route, Routes } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useSecurePublicProfile', () => ({ useSecurePublicProfile: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import UserProfile from '../UserProfile';

describe('UserProfile', () => {
  it('renders without crashing', () => {
    const { container } = renderWithProviders(
      <Routes><Route path="/users/:userId" element={<UserProfile />} /></Routes>,
      { route: '/users/u1' },
    );
    expect(container).toBeTruthy();
  });
});
