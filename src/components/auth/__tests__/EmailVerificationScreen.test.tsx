import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockResendVerification = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ resendVerification: mockResendVerification }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, dOrOpts: any) => {
      if (typeof dOrOpts === 'string') return dOrOpts;
      return dOrOpts?.defaultValue || key;
    },
  }),
}));

import { EmailVerificationScreen } from '../EmailVerificationScreen';

describe('EmailVerificationScreen', () => {
  const defaultProps = {
    email: 'test@example.com',
    onBackToLogin: vi.fn(),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('should render with email address', () => {
    render(<EmailVerificationScreen {...defaultProps} />);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Check your email')).toBeInTheDocument();
  });

  it('should render resend button', () => {
    render(<EmailVerificationScreen {...defaultProps} />);
    expect(screen.getByText('Resend verification email')).toBeInTheDocument();
  });

  it('should render back to sign in button', () => {
    render(<EmailVerificationScreen {...defaultProps} />);
    expect(screen.getByText('Back to sign in')).toBeInTheDocument();
  });

  it('should call onBackToLogin', () => {
    render(<EmailVerificationScreen {...defaultProps} />);
    fireEvent.click(screen.getByText('Back to sign in'));
    expect(defaultProps.onBackToLogin).toHaveBeenCalled();
  });

  it('should call resendVerification on resend click', async () => {
    mockResendVerification.mockResolvedValue({ error: null });
    render(<EmailVerificationScreen {...defaultProps} />);
    fireEvent.click(screen.getByText('Resend verification email'));
    await waitFor(() => expect(mockResendVerification).toHaveBeenCalledWith('test@example.com'));
  });

  it('should show success message after resend', async () => {
    mockResendVerification.mockResolvedValue({ error: null });
    render(<EmailVerificationScreen {...defaultProps} />);
    fireEvent.click(screen.getByText('Resend verification email'));
    await waitFor(() => expect(screen.getByText(/verification email sent/i)).toBeInTheDocument());
  });

  it('should show error on resend failure', async () => {
    mockResendVerification.mockResolvedValue({ error: { message: 'Rate limited' } });
    render(<EmailVerificationScreen {...defaultProps} />);
    fireEvent.click(screen.getByText('Resend verification email'));
    await waitFor(() => expect(screen.getByText('Rate limited')).toBeInTheDocument());
  });
});
