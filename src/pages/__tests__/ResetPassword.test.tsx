/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mockNavigate = vi.fn();
const mockUpdatePassword = vi.fn();
const mockToast = vi.fn();

let authState = { user: null as unknown, loading: false, passwordRecovery: false };

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    passwordRecovery: authState.passwordRecovery,
    updatePassword: mockUpdatePassword,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d: unknown) =>
      typeof d === 'string' ? d : ((d as { defaultValue?: string })?.defaultValue ?? _k),
    i18n: { language: 'en' },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/routing/LocalizedLink', () => ({
  // eslint-disable-next-line jsx-a11y/anchor-is-valid -- test mock, never rendered to users
  LocalizedLink: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

// PasswordStrengthMeter lazy-loads zxcvbn; score off length so tests are sync.
vi.mock('@/components/auth/PasswordStrengthMeter', () => ({
  PasswordStrengthMeter: ({
    password,
    onScoreChange,
  }: {
    password: string;
    onScoreChange?: (s: 0 | 1 | 2 | 3 | 4) => void;
  }) => {
    const score = password.length >= 12 ? 3 : password.length >= 8 ? 2 : 0;
    onScoreChange?.(score as 0 | 1 | 2 | 3 | 4);
    return <div data-testid="strength" data-score={score} />;
  },
}));

import ResetPassword from '../ResetPassword';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/auth/reset-password']}>
      <ResetPassword />
    </MemoryRouter>,
  );

const fill = (pw: string, confirm: string) => {
  fireEvent.change(document.querySelector('#new-password')!, { target: { value: pw } });
  fireEvent.change(document.querySelector('#confirm-password')!, { target: { value: confirm } });
};

beforeEach(() => {
  vi.clearAllMocks();
  authState = { user: null, loading: false, passwordRecovery: false };
});

describe('ResetPassword — no recovery session', () => {
  it('shows the expired state rather than a blank page', () => {
    renderPage();
    expect(screen.getByText(/this reset link has expired/i)).toBeTruthy();
    expect(document.querySelector('#new-password')).toBeNull();
  });

  it('sends an already-signed-in visitor to settings', async () => {
    authState = { user: { id: 'u1' }, loading: false, passwordRecovery: false };
    renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/settings', { replace: true }));
  });
});

describe('ResetPassword — with recovery session', () => {
  beforeEach(() => {
    authState = { user: { id: 'u1' }, loading: false, passwordRecovery: true };
  });

  it('renders the form', () => {
    renderPage();
    expect(document.querySelector('#new-password')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('rejects a mismatch', async () => {
    renderPage();
    fill('correcthorse', 'correcthorseX');
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Both passwords must match.');
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('rejects a too-short password', async () => {
    renderPage();
    fill('short', 'short');
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least/i);
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('rejects a weak password that is long enough', async () => {
    // 8 chars scores 2 in the stub, so drive the weak branch with 7.
    renderPage();
    fill('weakpwd', 'weakpwd');
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('updates the password and leaves the page', async () => {
    mockUpdatePassword.mockResolvedValue({ error: null });
    renderPage();
    fill('correcthorsebattery', 'correcthorsebattery');
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith('correcthorsebattery'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(mockToast).toHaveBeenCalled();
  });

  it('surfaces a server error and stays put', async () => {
    mockUpdatePassword.mockResolvedValue({ error: { message: 'Token has expired' } });
    renderPage();
    fill('correcthorsebattery', 'correcthorsebattery');
    fireEvent.submit(document.querySelector('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Token has expired');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
