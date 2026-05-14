import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockSignUp = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockEmit = vi.fn();
const mockReset = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signUp: mockSignUp, signInWithOAuth: mockSignInWithOAuth }),
}));

vi.mock('@/hooks/useSignupFunnel', () => ({
  useSignupFunnel: () => ({ emit: mockEmit, reset: mockReset }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d: unknown) => (typeof d === 'string' ? d : (d as { defaultValue?: string })?.defaultValue ?? _k), i18n: { language: 'en' } }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to?: string; children: React.ReactNode }) => (
    <a href={typeof to === 'string' && to.length > 0 ? to : '/'}>{children}</a>
  ),
}));

vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => vi.fn(),
}));

// PasswordStrengthMeter lazy-loads zxcvbn; stub it to call onScoreChange immediately.
vi.mock('../PasswordStrengthMeter', () => ({
  PasswordStrengthMeter: ({ password, onScoreChange }: { password: string; onScoreChange?: (s: 0 | 1 | 2 | 3 | 4) => void }) => {
    const score = password.length >= 12 ? 3 : password.length >= 8 ? 2 : 0;
    onScoreChange?.(score as 0 | 1 | 2 | 3 | 4);
    return <div data-testid="strength" data-score={score} />;
  },
}));

import Signup from '../Signup';

const onBack = vi.fn();

describe('Signup (single-screen)', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUp.mockResolvedValue({ error: null });
  });

  it('renders email, password, OAuth and one consent checkbox', () => {
    render(<Signup onBack={onBack} />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    expect(screen.getByText('Continue with Apple')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('requires consent before submitting', async () => {
    render(<Signup onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-strong-pw-123' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    await waitFor(() => expect(mockSignUp).not.toHaveBeenCalled());
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('rejects passwords shorter than 8 chars', async () => {
    render(<Signup onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    await waitFor(() => expect(mockSignUp).not.toHaveBeenCalled());
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('submits with only email + password + consent and defaults display_name to email local-part', async () => {
    render(<Signup onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword-strong' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    const args = mockSignUp.mock.calls[0];
    expect(args[0]).toBe('alice@example.com');
    expect(args[1]).toBe('mypassword-strong');
    expect(args[2].display_name).toBe('alice');
    expect(args[2].preferred_language).toBe('en');
    expect(args[2].pronouns).toBeUndefined();
    expect(args[2].location).toBeUndefined();
    expect(args[2].interests).toBeUndefined();
  });

  it('shows already-registered error when signUp rejects with that message', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'User already registered' } });
    render(<Signup onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword-strong' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/already exists/i),
    );
  });

  it('emits signup_landing_view on mount and signup_completed on success', async () => {
    render(<Signup onBack={onBack} />);
    expect(mockEmit).toHaveBeenCalledWith('signup_landing_view');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword-strong' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() =>
      expect(mockEmit).toHaveBeenCalledWith('signup_completed', { provider: 'email' }),
    );
  });
});
