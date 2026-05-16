/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { useAuthMock, resendMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  resendMock: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string) => fallback }),
}));

import { EmailVerifyBanner } from '../EmailVerifyBanner';

beforeEach(() => {
  useAuthMock.mockReset();
  resendMock.mockReset();
});

describe('EmailVerifyBanner', () => {
  it('renders nothing when no user', () => {
    useAuthMock.mockReturnValue({ user: null, resendVerification: resendMock });
    const { container } = render(<EmailVerifyBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when email is already confirmed', () => {
    useAuthMock.mockReturnValue({
      user: { email: 'a@b.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
      resendVerification: resendMock,
    });
    const { container } = render(<EmailVerifyBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the unverified banner with a Resend button', () => {
    useAuthMock.mockReturnValue({
      user: { email: 'a@b.com', email_confirmed_at: null },
      resendVerification: resendMock,
    });
    render(<EmailVerifyBanner />);
    expect(screen.getByText(/Verify your email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend/i })).toBeInTheDocument();
  });

  it('calls resendVerification with the user email on click and shows success copy', async () => {
    useAuthMock.mockReturnValue({
      user: { email: 'a@b.com', email_confirmed_at: null },
      resendVerification: resendMock,
    });
    resendMock.mockResolvedValueOnce({ error: null });

    render(<EmailVerifyBanner />);
    fireEvent.click(screen.getByRole('button', { name: /Resend/i }));

    await waitFor(() =>
      expect(screen.getByText(/Verification email sent/i)).toBeInTheDocument(),
    );
    expect(resendMock).toHaveBeenCalledWith('a@b.com');
    // Resend button is hidden after sent.
    expect(screen.queryByRole('button', { name: /Resend/i })).not.toBeInTheDocument();
  });

  it('keeps the banner visible (and reverts to original copy) when send fails', async () => {
    useAuthMock.mockReturnValue({
      user: { email: 'a@b.com', email_confirmed_at: null },
      resendVerification: resendMock,
    });
    resendMock.mockResolvedValueOnce({ error: { message: 'rate-limited' } });

    render(<EmailVerifyBanner />);
    fireEvent.click(screen.getByRole('button', { name: /Resend/i }));

    await waitFor(() => expect(resendMock).toHaveBeenCalled());
    expect(screen.getByText(/Verify your email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend/i })).toBeInTheDocument();
  });

  it('disables the button while sending', async () => {
    useAuthMock.mockReturnValue({
      user: { email: 'a@b.com', email_confirmed_at: null },
      resendVerification: () => new Promise(() => {}), // never resolves
    });
    render(<EmailVerifyBanner />);
    const btn = screen.getByRole('button', { name: /Resend/i });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });
});
