/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mockNavigate = vi.fn();
const mockSignIn = vi.fn();
const mockResetPassword = vi.fn();
const mockToast = vi.fn();

let authState: {
  user: unknown;
  passwordRecovery: boolean;
} = { user: null, passwordRecovery: false };

vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    resetPassword: mockResetPassword,
    user: authState.user,
    passwordRecovery: authState.passwordRecovery,
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

// Signup pulls in the whole signup tree (turnstile, zxcvbn, supabase fns).
// This suite is about the Auth page shell, not the signup form.
vi.mock('@/components/auth/Signup', () => ({
  default: () => <div data-testid="signup-form" />,
}));

// Renders a real Navigate, which we assert on via the router below.
const renderAuth = (initialEntry = '/auth') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Auth />
    </MemoryRouter>,
  );

import Auth from '../Auth';

beforeEach(() => {
  vi.clearAllMocks();
  authState = { user: null, passwordRecovery: false };
});

describe('Auth — sign in', () => {
  it('submits the typed credentials', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    renderAuth();

    fireEvent.change(document.querySelector('input[type="email"]')!, {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(document.querySelector('#password')!, { target: { value: 'hunter22' } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    expect(mockSignIn.mock.calls[0][0]).toBe('a@b.com');
    expect(mockSignIn.mock.calls[0][1]).toBe('hunter22');
  });

  it('maps Invalid login credentials to the friendly string', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    renderAuth();

    fireEvent.change(document.querySelector('input[type="email"]')!, {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(document.querySelector('#password')!, { target: { value: 'wrong' } });
    fireEvent.submit(document.querySelector('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('blocks submit when a field is empty', async () => {
    renderAuth();
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Please fill in all fields');
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

describe('Auth — forgot password', () => {
  it('sends the reset link and confirms', async () => {
    mockResetPassword.mockResolvedValue({ error: null });
    renderAuth();

    fireEvent.click(screen.getByText(/forgot/i));
    // The panels swap under AnimatePresence mode="wait", so for a beat the
    // exiting sign-in form is still the one in the DOM — interacting before
    // the swap settles submits through handleLogin instead of handleForgot.
    await screen.findByText(/back to sign in/i);

    fireEvent.change(document.querySelector('input[type="email"]')!, {
      target: { value: 'a@b.com' },
    });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(mockResetPassword).toHaveBeenCalledWith('a@b.com', undefined));
    expect(await screen.findByText(/check your email/i)).toBeTruthy();
  });
});

describe('Auth — redirect resolution', () => {
  it('prefers ?redirect= over the default', async () => {
    authState = { user: { id: 'u1' }, passwordRecovery: false };
    renderAuth('/auth?redirect=/travel');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/travel'));
  });

  it('falls back to / with no param', async () => {
    authState = { user: { id: 'u1' }, passwordRecovery: false };
    renderAuth();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('accepts the deprecated ?next= alias', async () => {
    // Never read before, so every ?next= link silently landed on the homepage.
    authState = { user: { id: 'u1' }, passwordRecovery: false };
    renderAuth('/auth?next=/travel');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/travel'));
  });

  it('prefers ?redirect= over ?next= when both are present', async () => {
    authState = { user: { id: 'u1' }, passwordRecovery: false };
    renderAuth('/auth?redirect=/venues&next=/travel');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/venues'));
  });

  it('refuses an off-site redirect and falls back to /', async () => {
    authState = { user: { id: 'u1' }, passwordRecovery: false };
    renderAuth('/auth?redirect=https%3A%2F%2Fevil.com');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('refuses a protocol-relative redirect', async () => {
    authState = { user: { id: 'u1' }, passwordRecovery: false };
    renderAuth('/auth?redirect=%2F%2Fevil.com');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('does not navigate during render', () => {
    // The redirect must come from an effect. If it fired in the render body
    // React logs "Cannot update a component while rendering a different one".
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authState = { user: { id: 'u1' }, passwordRecovery: false };
    renderAuth();
    expect(
      spy.mock.calls.some((c) => String(c[0]).includes('while rendering a different component')),
    ).toBe(false);
    spy.mockRestore();
  });
});

describe('Auth — password recovery', () => {
  it('routes a recovery session to the reset page instead of home', async () => {
    // A recovery link mints a session, so `user` is set. Without the recovery
    // branch this navigates to redirectTo and the reset is unreachable.
    authState = { user: { id: 'u1' }, passwordRecovery: true };
    renderAuth('/auth?reset=1');

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});

describe('Auth — signup mode', () => {
  it('renders the signup form for ?mode=signup', () => {
    renderAuth('/auth?mode=signup');
    expect(screen.getByTestId('signup-form')).toBeTruthy();
  });
});
