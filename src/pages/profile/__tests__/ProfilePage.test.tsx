/** @vitest-environment jsdom */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

const state = vi.hoisted(() => ({
  target: 'u1',
  claimedOwner: true,
  missing: false,
  privateMode: false,
  savePending: vi.fn(),
}));
const profile = {
  id: 'p1',
  user_id: 'u1',
  username: 'alex',
  created_at: '2026-01-01',
  pronouns: 'owner-only-pronouns',
  privacy_settings: { profile_visibility: 'public', pronouns_visibility: 'private' },
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/useSecurePublicProfile', () => ({
  useSecurePublicProfile: () => ({
    profile: state.missing ? null : { ...profile, user_id: state.target },
    loading: false,
    error: null,
    isOwnProfile: state.claimedOwner,
  }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: state.missing
      ? null
      : {
          ...profile,
          privacy_settings: {
            ...profile.privacy_settings,
            profile_visibility: state.privateMode ? 'private' : 'public',
          },
        },
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useStatus', () => ({ useStatus: () => ({ status: null }) }));
vi.mock('@/hooks/usePublicStatus', () => ({ usePublicStatus: () => ({ status: null }) }));
vi.mock('@/hooks/useCommunityScore', () => ({ useCommunityScore: () => ({ data: null }) }));
vi.mock('@/hooks/usePublicCommunityScore', () => ({
  usePublicCommunityScore: () => ({ score: null }),
}));
vi.mock('@/components/profile/ProfileHeader', () => ({
  ProfileHeader: ({
    isOwnProfile,
    onEditProfile,
    profile,
  }: {
    isOwnProfile: boolean;
    onEditProfile: () => void;
    profile: Record<string, unknown>;
  }) => (
    <header>
      {typeof profile.pronouns === 'string' && <span>{profile.pronouns}</span>}
      {isOwnProfile && <button onClick={onEditProfile}>Edit profile</button>}
    </header>
  ),
}));
vi.mock('@/components/profile/tabs/OverviewTab', () => ({
  OverviewTab: ({ editor }: { editor?: React.ReactNode }) => <div>Overview{editor}</div>,
}));
vi.mock('@/components/profile/tabs/TravelTab', () => ({
  TravelTab: () => <div>Travel footprint</div>,
}));
vi.mock('@/components/profile/tabs/GroupsTab', () => ({ GroupsTab: () => <div>Groups</div> }));
vi.mock('@/components/profile/tabs/ContributionsTab', () => ({
  ContributionsTab: () => <div>Contributions</div>,
}));
vi.mock('@/components/profile/tabs/ProgressTab', () => ({
  ProgressTab: () => <div>Progress</div>,
}));
vi.mock('@/components/status/StatusPicker', () => ({ StatusPicker: () => null }));
vi.mock('@/components/profile/ProfileEditor', async () => {
  const { useImperativeHandle } = await import('react');
  return {
    default: function FakeEditor({
      section,
      editorRef,
    }: {
      section: string;
      editorRef: React.Ref<unknown>;
    }) {
      useImperativeHandle(editorRef, () => ({ savePending: state.savePending }));
      return <div data-testid="editor">{section}</div>;
    },
  };
});

import ProfilePage from '../ProfilePage';
function Probe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/user/:userId/:tab?" element={<ProfilePage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

describe('contextual profile editing', () => {
  beforeEach(() => {
    state.target = 'u1';
    state.claimedOwner = true;
    state.missing = false;
    state.privateMode = false;
    state.savePending.mockReset().mockResolvedValue(true);
  });
  it('renders not-found state', () => {
    state.missing = true;
    renderAt('/user/u1');
    expect(screen.getByText('Profile not found')).toBeTruthy();
  });
  it('puts account controls in an owner-only profile tab', async () => {
    renderAt('/user/u1/account');
    expect(screen.getByRole('tab', { name: 'Account' })).toBeTruthy();
    expect(await screen.findByTestId('editor')).toHaveTextContent('account');
  });
  it('opens the profile editor in place rather than leaving for settings', async () => {
    renderAt('/user/u1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    expect(await screen.findByTestId('editor')).toHaveTextContent('profile');
    expect(screen.getByTestId('location')).toHaveTextContent('/user/u1?edit=profile');
  });
  it('never mounts private editors on someone else’s profile, even with an owner claim', () => {
    state.target = 'u2';
    renderAt('/user/u2/account?edit=privacy');
    expect(screen.queryByRole('tab', { name: 'Account' })).toBeNull();
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit profile' })).toBeNull();
  });
  it('hides account and editors while previewing a public profile', async () => {
    renderAt('/user/u1?edit=privacy');
    expect(await screen.findByTestId('editor')).toHaveTextContent('privacy');
    expect(screen.getByText('owner-only-pronouns')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    await waitFor(() => expect(screen.queryByTestId('editor')).toBeNull());
    expect(screen.queryByRole('tab', { name: 'Account' })).toBeNull();
    expect(state.savePending).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('owner-only-pronouns')).toBeNull();
  });
  it('keeps the current editor and lens when a pending save fails', async () => {
    state.savePending.mockResolvedValue(false);
    renderAt('/user/u1?edit=profile');
    await screen.findByTestId('editor');
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    await waitFor(() => expect(state.savePending).toHaveBeenCalled());
    expect(screen.getByTestId('editor')).toHaveTextContent('profile');
    expect(screen.getByRole('tab', { name: 'Account' })).toBeTruthy();
  });
  it('puts travel preferences inside the existing Travel tab', async () => {
    renderAt('/user/u1/travel?edit=travel');
    expect(await screen.findByTestId('editor')).toHaveTextContent('travel');
    expect(screen.getByText('Travel footprint')).toBeTruthy();
  });
  it('shows a visibility notice instead of the private profile under a public lens', async () => {
    state.privateMode = true;
    renderAt('/user/u1');
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    await screen.findByText(
      'This profile isn’t visible in this view. Switch to You to continue editing.',
    );
    expect(screen.queryByText('owner-only-pronouns')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Account' })).toBeNull();
  });
});
