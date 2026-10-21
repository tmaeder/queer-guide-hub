import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { TripInviteControls } from '../TripInviteControls';
import TripInvitationsPage from '@/pages/trips/TripInvitationsPage';
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  change: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  auth: { user: { id: 'member' } as { id: string } | null, loading: false },
}));
vi.mock('@/lib/tripInvitations', () => ({
  loadTripInvitations: mocks.load,
  changeTripInvitation: mocks.change,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => mocks.navigate }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, options?: Record<string, string>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, key) => options?.[key] ?? key),
  }),
}));
const invitation = {
  id: 'invitation',
  trip_id: 'trip',
  trip_title: 'Private destination',
  inviter_name: 'Member',
  username: 'guest',
  role: 'viewer',
  status: 'pending',
  expires_at: '2026-11-20T10:00:00Z',
  actionable: true,
  can_revoke: true,
};
function mount(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{component}</MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: 'member' };
  mocks.auth.loading = false;
  mocks.load.mockResolvedValue({ can_invite: true, invitations: [invitation] });
  mocks.change.mockResolvedValue({ status: 'accepted', trip_id: 'trip' });
});
describe('trip invitation review', () => {
  it('requires an explicit acceptance and then opens the accepted trip', async () => {
    mount(<TripInvitationsPage />);
    await screen.findByText('Private destination');
    expect(mocks.change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() =>
      expect(mocks.change).toHaveBeenCalledWith({
        action: 'respond',
        invitation_id: 'invitation',
        decision: 'accept',
      }),
    );
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/trips/trip'));
  });
  it('declines without navigating or enabling email', async () => {
    mocks.change.mockResolvedValue({ status: 'declined', trip_id: 'trip' });
    mount(<TripInvitationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Decline invitation' }));
    await waitFor(() =>
      expect(mocks.change).toHaveBeenCalledWith({
        action: 'respond',
        invitation_id: 'invitation',
        decision: 'decline',
      }),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it('shows a sign-in link and makes no invitation request while signed out', async () => {
    mocks.auth.user = null;
    mount(<TripInvitationsPage />);
    expect(screen.getByRole('link', { name: 'Sign in to review invitations' })).toHaveAttribute(
      'href',
      '/auth?redirect=%2Ftrips%2Finvitations',
    );
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('recovers from a failed load without accepting on retry', async () => {
    mocks.load.mockRejectedValueOnce(new Error('offline'));
    mount(<TripInvitationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await screen.findByText('Private destination');
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it('never opens a trip after a stale or revoked invitation fails', async () => {
    mocks.change.mockRejectedValueOnce(new Error('revoked'));
    mount(<TripInvitationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
describe('trip member invitation controls', () => {
  it('sends an existing username and selected role without actor or recipient addresses', async () => {
    mount(<TripInviteControls tripId="trip" enabled />);
    fireEvent.change(await screen.findByLabelText('Member username'), {
      target: { value: 'guest' },
    });
    fireEvent.change(screen.getByLabelText('Access after acceptance'), {
      target: { value: 'editor' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    await waitFor(() =>
      expect(mocks.change).toHaveBeenCalledWith({
        action: 'create',
        trip_id: 'trip',
        username: 'guest',
        role: 'editor',
      }),
    );
  });
  it('hides invitation controls when the server denies management access', async () => {
    mocks.load.mockResolvedValue({ can_invite: false, invitations: [] });
    mount(<TripInviteControls tripId="trip" enabled />);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('trip'));
    expect(screen.queryByRole('button', { name: 'Send invitation' })).not.toBeInTheDocument();
  });
  it('revokes only the selected pending invitation', async () => {
    mount(<TripInviteControls tripId="trip" enabled />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke invitation' }));
    await waitFor(() =>
      expect(mocks.change).toHaveBeenCalledWith({ action: 'revoke', invitation_id: 'invitation' }),
    );
  });
});
