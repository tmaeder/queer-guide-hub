/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useSecurePublicProfile', () => ({ useSecurePublicProfile: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import UserProfile from '../UserProfile';

describe('UserProfile', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/users/u1']}>
        <Routes><Route path="/users/:userId" element={<UserProfile />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
