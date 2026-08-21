/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mockNavigate = vi.fn();
let passwordRecovery = false;

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ passwordRecovery }),
}));

import { RecoveryRedirect } from '../RecoveryRedirect';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <RecoveryRedirect />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  passwordRecovery = false;
});

describe('RecoveryRedirect', () => {
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
      <MemoryRouter initialEntries={['/venues']}>
        <RecoveryRedirect />
      </MemoryRouter>,
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  });
});
