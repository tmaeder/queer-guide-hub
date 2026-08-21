/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mockNavigate = vi.fn();
const mockEmit = vi.fn();
const mockUpdateProfile = vi.fn().mockResolvedValue({ error: null });

let authState: { user: unknown; loading: boolean } = { user: { id: 'u1' }, loading: false };
let profileState: Record<string, unknown> | null = {
  username: 'member1234',
  avatar_config: { skinTone: 'brown' },
};

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => mockNavigate }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    hasPasskey: false,
    enrollPasskey: vi.fn(),
  }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: profileState, updateProfile: mockUpdateProfile }),
}));
vi.mock('@/hooks/useSignupFunnel', () => ({ useSignupFunnel: () => ({ emit: mockEmit }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// Expose the shell's controls so the steps can be driven.
vi.mock('@/components/ui/StepperShell', () => ({
  StepperShell: ({
    children,
    onNext,
    onSkip,
  }: {
    children: React.ReactNode;
    onNext?: () => void;
    onSkip?: () => void;
  }) => (
    <>
      {children}
      <button data-testid="next" onClick={onNext}>
        next
      </button>
      <button data-testid="skip" onClick={onSkip}>
        skip
      </button>
    </>
  ),
}));

// UsernameSelector hits supabase.functions.invoke.
vi.mock('@/components/auth/UsernameSelector', () => ({
  UsernameSelector: ({ value }: { value: string | null }) => (
    <div data-testid="username-selector">{value}</div>
  ),
}));
vi.mock('@/components/profile/AvatarQuickPick', () => ({
  AvatarQuickPick: () => <div data-testid="avatar-pick" />,
}));

import Welcome from '../Welcome';

const renderAt = (path = '/onboarding/welcome') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Welcome />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  authState = { user: { id: 'u1' }, loading: false };
  profileState = { username: 'member1234', avatar_config: { skinTone: 'brown' } };
});

describe('Welcome — profile step', () => {
  it('opens on the profile step, prefilled from what the trigger assigned', () => {
    renderAt();
    expect(screen.getByTestId('username-selector')).toHaveTextContent('member1234');
    expect(screen.getByTestId('avatar-pick')).toBeInTheDocument();
  });

  it('does not write the profile when the user changes nothing', async () => {
    renderAt();
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(mockUpdateProfile).not.toHaveBeenCalled());
  });
});

describe('Welcome — finishing', () => {
  it('stamps onboarding_completed_at when SKIPPED', async () => {
    // A skipped onboarding is a finished one. Recording only completions
    // would re-show this flow on every OAuth return, forever.
    renderAt();
    fireEvent.click(screen.getByTestId('skip'));

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalled());
    expect(mockUpdateProfile.mock.calls[0][0]).toHaveProperty('onboarding_completed_at');
    expect(mockEmit).toHaveBeenCalledWith('onboarding_skipped');
  });

  it('honours ?redirect= instead of always going home', async () => {
    renderAt('/onboarding/welcome?redirect=%2Ftravel');
    fireEvent.click(screen.getByTestId('skip'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/travel', { replace: true }));
  });

  it('falls back to / with no redirect param', async () => {
    renderAt();
    fireEvent.click(screen.getByTestId('skip'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('refuses an off-site redirect', async () => {
    renderAt('/onboarding/welcome?redirect=https%3A%2F%2Fevil.com');
    fireEvent.click(screen.getByTestId('skip'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
  });
});

describe('Welcome — auth gate', () => {
  it('sends an anonymous visitor to /auth', async () => {
    authState = { user: null, loading: false };
    renderAt();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/auth', { replace: true }));
  });
});
