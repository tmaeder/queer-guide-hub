/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { useAuthMock, signInMock, useToastMock, toastFn, navigateMock } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    useAuthMock: vi.fn(),
    signInMock: vi.fn(),
    useToastMock: vi.fn(),
    toastFn,
    navigateMock: vi.fn(),
  };
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => navigateMock,
}));

import { AuthDialog } from '../AuthDialog';

beforeEach(() => {
  useAuthMock.mockReset();
  signInMock.mockReset();
  useToastMock.mockReset();
  toastFn.mockReset();
  navigateMock.mockReset();
  useAuthMock.mockReturnValue({ signIn: signInMock });
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('AuthDialog — signin mode', () => {
  it('renders sign-in form when open with default signin mode', () => {
    render(<AuthDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  it('toggles password visibility via the eye icon', () => {
    render(<AuthDialog open onOpenChange={vi.fn()} />);
    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: /Show password/i }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: /Hide password/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('submits credentials, closes dialog on success', async () => {
    signInMock.mockResolvedValueOnce({ error: null });
    const onOpenChange = vi.fn();

    render(<AuthDialog open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => expect(signInMock).toHaveBeenCalledWith('a@b.com', 'secret'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows destructive toast on signIn error (Error instance)', async () => {
    signInMock.mockResolvedValueOnce({ error: new Error('Invalid credentials') });
    render(<AuthDialog open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() =>
      expect(toastFn).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sign in failed',
          description: 'Invalid credentials',
          variant: 'destructive',
        }),
      ),
    );
  });

  it('shows destructive toast on signIn error (plain object with message)', async () => {
    signInMock.mockResolvedValueOnce({ error: { message: 'rate-limited' } });
    render(<AuthDialog open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() =>
      expect(toastFn).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'rate-limited' }),
      ),
    );
  });

  it('shows generic toast on thrown exception', async () => {
    signInMock.mockRejectedValueOnce(new Error('network'));
    render(<AuthDialog open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() =>
      expect(toastFn).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Something went wrong' }),
      ),
    );
  });
});

describe('AuthDialog — signup mode', () => {
  it('does not render the form and routes to /auth?mode=signup', async () => {
    const onOpenChange = vi.fn();
    render(<AuthDialog open onOpenChange={onOpenChange} defaultMode="signup" />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/auth?mode=signup'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Form is not rendered.
    expect(screen.queryByLabelText(/Email Address/i)).not.toBeInTheDocument();
  });

  it('signup CTA closes dialog + navigates', () => {
    const onOpenChange = vi.fn();
    render(<AuthDialog open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).toHaveBeenCalledWith('/auth?mode=signup');
  });
});

describe('AuthDialog — closed', () => {
  it('does not render anything visible when closed', () => {
    render(<AuthDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByLabelText(/Email Address/i)).not.toBeInTheDocument();
  });
});
