/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signIn: vi.fn(), resetPassword: vi.fn(), user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import Auth from '../Auth';

describe('Auth', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Auth /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
