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

vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => vi.fn(),
}));

// No EmailVerificationScreen / UsernameSelector stubs: Signup imports neither
// any more. The verification screen was deleted (autoconfirm made it
// unreachable) and username selection moved to onboarding.

// PasswordStrengthMeter lazy-loads zxcvbn; stub it to call onScoreChange immediately.
vi.mock('../PasswordStrengthMeter', () => ({
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
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
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

  it('creates the account from ONE screen — no username or avatar step', async () => {
    render(<Signup onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword-strong' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    // The old flow needed a SECOND screen and a second click before signUp ran.
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    // Exactly three controls on the screen: email, password, consent.
    expect(screen.getAllByRole('textbox')).toHaveLength(1); // email
    expect(screen.getAllByRole('checkbox')).toHaveLength(1); // consent
  });

  it('sends ONLY consent timestamps — everything else is derived server-side', async () => {
    render(<Signup onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword-strong' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    const [email, password, metadata] = mockSignUp.mock.calls[0];
    expect(email).toBe('alice@example.com');
    expect(password).toBe('mypassword-strong');

    expect(Object.keys(metadata).sort()).toEqual([
      'age_confirmed_at',
      'privacy_accepted_at',
      'terms_accepted_at',
    ]);
    // Regressions worth naming: display_name derived from the email is an
    // outing vector, username/avatar are minted by the trigger, and
    // preferred_language has no column to land in.
    expect(metadata.display_name).toBeUndefined();
    expect(metadata.username).toBeUndefined();
    expect(metadata.avatar_config).toBeUndefined();
    expect(metadata.preferred_language).toBeUndefined();
  });

  it('shows the error and stays on the form when signUp rejects', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'User already registered' } });
    render(<Signup onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword-strong' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/already registered/i),
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('emits landing, submit_attempt and completed', async () => {
    render(<Signup onBack={onBack} />);
    expect(mockEmit).toHaveBeenCalledWith('signup_landing_view');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword-strong' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    // Emitted BEFORE validation, so a blocked submit is still measurable —
    // this is what separates "never tried" from "tried and was stopped".
    expect(mockEmit).toHaveBeenCalledWith('signup_submit_attempt');
    await waitFor(() =>
      expect(mockEmit).toHaveBeenCalledWith('signup_completed', { provider: 'email' }),
    );
  });

  it('emits submit_attempt even when validation blocks the submit', async () => {
    render(<Signup onBack={onBack} />);
    // No consent — rejected. Native validation would have swallowed this
    // silently before noValidate.
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword-strong' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    expect(mockEmit).toHaveBeenCalledWith('signup_submit_attempt');
    await waitFor(() => expect(mockSignUp).not.toHaveBeenCalled());
  });
});
