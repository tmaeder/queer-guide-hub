import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockSignInWithOAuth = vi.fn();
const mockEmit = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signInWithOAuth: mockSignInWithOAuth }),
}));

vi.mock('@/hooks/useSignupFunnel', () => ({
  useSignupFunnel: () => ({ emit: mockEmit }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d: string) => d }),
}));

import { OAuthButtons } from '../OAuthButtons';

describe('OAuthButtons', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should render the Apple button only (Google is not enabled in Supabase)', () => {
    render(<OAuthButtons />);
    expect(screen.getByText('Continue with Apple')).toBeInTheDocument();
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
  });

  it('should call signInWithOAuth with apple on click', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    render(<OAuthButtons />);
    fireEvent.click(screen.getByText('Continue with Apple'));
    expect(mockSignInWithOAuth).toHaveBeenCalledWith('apple');
  });

  it('should emit oauth_start event', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    render(<OAuthButtons />);
    fireEvent.click(screen.getByText('Continue with Apple'));
    expect(mockEmit).toHaveBeenCalledWith('oauth_start', { provider: 'apple' });
  });

  it('should call onError when sign-in fails', async () => {
    const onError = vi.fn();
    mockSignInWithOAuth.mockResolvedValue({ error: { message: 'Popup closed' } });
    render(<OAuthButtons onError={onError} />);
    fireEvent.click(screen.getByText('Continue with Apple'));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Popup closed'));
  });

  it('should disable the button while loading', async () => {
    let resolve: (value: unknown) => void;
    mockSignInWithOAuth.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<OAuthButtons />);
    fireEvent.click(screen.getByText('Continue with Apple'));
    expect(screen.getByText('Continue with Apple').closest('button')).toBeDisabled();
    resolve!({ error: null });
  });
});
