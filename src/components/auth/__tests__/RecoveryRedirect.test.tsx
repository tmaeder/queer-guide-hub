/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mockNavigate = vi.fn();
let passwordRecovery = false;

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Importing the real useAuth module pulls in the supabase client; stub it so
// this suite stays a pure unit test.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  },
}));

import { RecoveryRedirect } from '../RecoveryRedirect';
import { AuthContext } from '@/hooks/useAuth';

// The REAL context, not a mocked useAuth — so this suite breaks if the
// component stops reading the context it is supposed to read.
const withAuth = (children: ReactNode) => (
  <AuthContext.Provider value={{ passwordRecovery } as never}>{children}</AuthContext.Provider>
);

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}>{withAuth(<RecoveryRedirect />)}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  passwordRecovery = false;
});

describe('RecoveryRedirect', () => {
  it('is inert with no AuthProvider instead of crashing the shell', () => {
    // Note the deliberate absence of withAuth(). This component mounts in
    // LayoutShell, above most of the tree, and useAuth() THROWS without a
    // provider — which took down 7 LayoutShell tests in CI. A shell-level
    // component must degrade to a no-op rather than kill everything below it.
    expect(() =>
      render(
        <MemoryRouter initialEntries={['/']}>
          <RecoveryRedirect />
        </MemoryRouter>,
      ),
    ).not.toThrow();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does nothing without a recovery session', async () => {
    renderAt('/');
    await waitFor(() => expect(mockNavigate).not.toHaveBeenCalled());
  });

  it('forwards a recovery landing on / to the reset page', async () => {
    // This is the case that matters: when the Supabase allowlist does not
    // contain our reset URL, GoTrue falls back to Site URL and the recovery
    // session materializes on "/". Without this the reset is unreachable.
    passwordRecovery = true;
    renderAt('/');
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/auth/reset-password', { replace: true }),
    );
  });

  it('forwards from the legacy ?reset=1 landing too', async () => {
    passwordRecovery = true;
    renderAt('/auth?reset=1');
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/auth/reset-password', { replace: true }),
    );
  });

  it('does not loop once already on the reset page', async () => {
    passwordRecovery = true;
    renderAt('/auth/reset-password');
    await waitFor(() => expect(mockNavigate).not.toHaveBeenCalled());
  });

  it('forwards only once, so abandoning the reset does not trap the user', async () => {
    // The flag lives for the whole tab session. Without the one-shot latch,
    // every later navigation would drag the user back to the reset page.
    passwordRecovery = true;
    const { rerender } = renderAt('/');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter initialEntries={['/venues']}>{withAuth(<RecoveryRedirect />)}</MemoryRouter>,
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  });
});
