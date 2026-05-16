/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { useAuthMock, useProfileMock, updateProfileMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useProfileMock: vi.fn(),
  updateProfileMock: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: useProfileMock }));
// Stub the heavy child so we don't drag in supabase + edge functions.
vi.mock('../UsernameSelector', () => ({
  UsernameSelector: ({ onChange }: { onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange('newuser')}>
      pick-mock
    </button>
  ),
}));

import { ClaimUsernameBanner } from '../ClaimUsernameBanner';

beforeEach(() => {
  sessionStorage.clear();
  useAuthMock.mockReset();
  useProfileMock.mockReset();
  updateProfileMock.mockReset();
  useProfileMock.mockReturnValue({ profile: null, updateProfile: updateProfileMock });
});

describe('ClaimUsernameBanner — gating', () => {
  it('renders nothing when no user', () => {
    useAuthMock.mockReturnValue({ user: null });
    const { container } = render(<ClaimUsernameBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once profile has a username', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    useProfileMock.mockReturnValue({
      profile: { username: 'already_set' },
      updateProfile: updateProfileMock,
    });
    const { container } = render(<ClaimUsernameBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once dismissed (session-scoped)', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    sessionStorage.setItem('qg.username-claim-dismissed', '1');
    const { container } = render(<ClaimUsernameBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ClaimUsernameBanner — banner', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    // Skip the dialog auto-open so the banner buttons aren't hidden by it.
    sessionStorage.setItem('qg.username-claim-prompted', '1');
  });

  it('renders banner with CTA + dismiss when user has no username', () => {
    render(<ClaimUsernameBanner />);
    expect(screen.getByText(/Claim your unique queer.guide identity/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose username/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dismiss/i })).toBeInTheDocument();
  });

  it('dismiss button persists to sessionStorage and hides the banner', () => {
    render(<ClaimUsernameBanner />);
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
    expect(sessionStorage.getItem('qg.username-claim-dismissed')).toBe('1');
    expect(screen.queryByText(/Claim your unique queer.guide identity/i)).not.toBeInTheDocument();
  });

  it('auto-opens the dialog once per session (PROMPTED_KEY)', () => {
    sessionStorage.removeItem('qg.username-claim-prompted');
    render(<ClaimUsernameBanner />);
    // Dialog header should be in the document on first mount.
    expect(screen.getByText(/Pick a unique handle/i)).toBeInTheDocument();
    expect(sessionStorage.getItem('qg.username-claim-prompted')).toBe('1');
  });

  it('does not auto-open again once PROMPTED_KEY is set', () => {
    sessionStorage.setItem('qg.username-claim-prompted', '1');
    render(<ClaimUsernameBanner />);
    expect(screen.queryByText(/Pick a unique handle/i)).not.toBeInTheDocument();
  });

  it('Save triggers updateProfile with the chosen username', async () => {
    updateProfileMock.mockResolvedValueOnce({ error: null });
    render(<ClaimUsernameBanner />);

    // Manually open the dialog (auto-open suppressed by PROMPTED_KEY).
    fireEvent.click(screen.getByRole('button', { name: /Choose username/i }));

    // Choose via stubbed selector, then Save.
    fireEvent.click(await screen.findByText('pick-mock'));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    expect(updateProfileMock).toHaveBeenCalledWith({ username: 'newuser' });
  });
});
