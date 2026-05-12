import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockEnrollPasskey = vi.fn();
const mockSignInWithPasskey = vi.fn();
const mockToast = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    enrollPasskey: mockEnrollPasskey,
    signInWithPasskey: mockSignInWithPasskey,
    hasPasskey: false,
    user: { id: 'user-1' },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { PasskeyButton } from '../PasskeyButton';

describe('PasskeyButton', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should render enroll button', () => {
    render(<PasskeyButton mode="enroll" />);
    expect(screen.getByText('Set up Passkey')).toBeInTheDocument();
    expect(screen.getByText('Enable passwordless sign-in')).toBeInTheDocument();
  });

  it('should render signin button', () => {
    render(<PasskeyButton mode="signin" />);
    expect(screen.getByText('Sign in with Passkey')).toBeInTheDocument();
    expect(screen.getByText('Use your device biometrics')).toBeInTheDocument();
  });

  it('should call enrollPasskey in enroll mode', async () => {
    mockEnrollPasskey.mockResolvedValue({ error: null });
    render(<PasskeyButton mode="enroll" />);
    fireEvent.click(screen.getByText('Set up Passkey'));
    await waitFor(() => expect(mockEnrollPasskey).toHaveBeenCalled());
  });

  it('should call signInWithPasskey in signin mode', async () => {
    mockSignInWithPasskey.mockResolvedValue({ error: null });
    render(<PasskeyButton mode="signin" />);
    fireEvent.click(screen.getByText('Sign in with Passkey'));
    await waitFor(() => expect(mockSignInWithPasskey).toHaveBeenCalled());
  });

  it('should show error toast on enrollment failure', async () => {
    mockEnrollPasskey.mockResolvedValue({ error: { message: 'Not supported' } });
    render(<PasskeyButton mode="enroll" />);
    fireEvent.click(screen.getByText('Set up Passkey'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Passkey Setup Failed' }),
    ));
  });

  it('should show success toast on enrollment', async () => {
    mockEnrollPasskey.mockResolvedValue({ error: null });
    render(<PasskeyButton mode="enroll" />);
    fireEvent.click(screen.getByText('Set up Passkey'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Passkey Setup Complete' }),
    ));
  });
});
