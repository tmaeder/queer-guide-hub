import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const mockNavigate = vi.fn();
vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => mockNavigate,
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

const cont = () => fireEvent.click(screen.getByRole('button', { name: /Continue$/ }));

/** Walks the wizard to the last step. */
function toConfirm(email = 'alice@example.com', password = 'mypassword-strong') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  cont();
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  cont();
}

describe('Signup (three-step wizard)', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUp.mockResolvedValue({ error: null });
  });

  it('opens on the email step with Apple and no password field yet', () => {
    render(<Signup onBack={onBack} />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByText('Continue with Apple')).toBeInTheDocument();
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('will not leave the email step with an invalid address', () => {
    render(<Signup onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    cont();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('rejects passwords shorter than 8 chars on the password step', () => {
    render(<Signup onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    cont();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    cont();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('Back returns to the previous step and keeps what was typed', () => {
    render(<Signup onBack={onBack} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    cont();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('a@b.co');
  });

  it('requires consent before submitting', async () => {
    render(<Signup onBack={onBack} />);
    toConfirm();
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    await waitFor(() => expect(mockSignUp).not.toHaveBeenCalled());
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('creates the account — no username or avatar step', async () => {
    render(<Signup onBack={onBack} />);
    toConfirm();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
  });

  it('sends ONLY consent timestamps — everything else is derived server-side', async () => {
    render(<Signup onBack={onBack} />);
    toConfirm();
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
  });

  it('shows the error and stays on the last step when signUp rejects', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'User already registered' } });
    render(<Signup onBack={onBack} />);
    toConfirm('a@b.co');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/already registered/i),
    );
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('emits landing, submit_attempt and completed', async () => {
    render(<Signup onBack={onBack} />);
    expect(mockEmit).toHaveBeenCalledWith('signup_landing_view');
    toConfirm('a@b.co');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    expect(mockEmit).toHaveBeenCalledWith('signup_submit_attempt');
    await waitFor(() =>
      expect(mockEmit).toHaveBeenCalledWith('signup_completed', { provider: 'email' }),
    );
  });

  it('emits submit_attempt even when validation blocks the submit', async () => {
    render(<Signup onBack={onBack} />);
    toConfirm('a@b.co');
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    expect(mockEmit).toHaveBeenCalledWith('signup_submit_attempt');
    await waitFor(() => expect(mockSignUp).not.toHaveBeenCalled());
  });

  it('emits a validation error when a step is blocked', () => {
    render(<Signup onBack={onBack} />);
    cont();
    expect(mockEmit).toHaveBeenCalledWith(
      'signup_validation_error',
      expect.objectContaining({ metadata: { fields: ['email'] } }),
    );
  });

  describe('on a passkey-capable device', () => {
    beforeEach(() => {
      (window as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential = function () {};
    });
    afterEach(() => {
      delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    });

    it('offers the passkey first and signs up without a password the reader typed', async () => {
      render(<Signup onBack={onBack} />);
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
      cont();
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Use a passkey/ }));
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
      await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
      expect((mockSignUp.mock.calls[0][1] as string).length).toBeGreaterThanOrEqual(24);
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/onboarding/welcome?passkey=1', {
          replace: true,
        }),
      );
    });

    it('still lets the reader choose a password', () => {
      render(<Signup onBack={onBack} />);
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
      cont();
      fireEvent.click(screen.getByRole('button', { name: /Use a password instead/ }));
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });
  });
});
