/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false, signIn: vi.fn(), signUp: vi.fn() }) }));
vi.mock('@/hooks/useSignupFunnel', () => ({ useSignupFunnel: () => ({ track: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/ui/StepperShell', () => ({ StepperShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import Welcome from '../Welcome';

describe('Welcome', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Welcome /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
