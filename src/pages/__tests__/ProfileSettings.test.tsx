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

import ProfileSettings from '../ProfileSettings';

describe('ProfileSettings', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><ProfileSettings /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
