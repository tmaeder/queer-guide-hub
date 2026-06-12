/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, hasPasskey: false }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, isLoading: false, updateProfile: vi.fn() }) }));
vi.mock('@/hooks/useProfileData', () => ({ useProfileData: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import Settings from '../Settings';

describe('Settings', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
