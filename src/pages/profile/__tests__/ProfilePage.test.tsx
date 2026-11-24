/** @vitest-environment jsdom */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

const state = vi.hoisted(() => ({
  target: 'u1',
  claimedOwner: true,
  missing: false,
  privateMode: false,
  signedOut: false,
  datingVisible: false,
  travelShared: true,
  activityCount: 1,
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
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.signedOut ? null : { id: 'u1' }, loading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useStatus', () => ({ useStatus: () => ({ status: null }) }));
vi.mock('@/hooks/usePublicStatus', () => ({ usePublicStatus: () => ({ status: null }) }));
vi.mock('@/components/profile/ProfileHeader', () => ({
  ProfileHeader: ({
    isOwnProfile,
    onEditAvatar,
    profile,
    tools,
  }: {
    isOwnProfile: boolean;
    onEditAvatar: () => void;
    profile: Record<string, unknown>;
    tools?: React.ReactNode;
  }) => (
    <header>
      {typeof profile.pronouns === 'string' && <span>{profile.pronouns}</span>}
      {isOwnProfile && <button onClick={onEditAvatar}>Change avatar</button>}
      {tools}
    </header>
  ),
}));
vi.mock('@/components/moderation/ReportContentDialog', () => ({
  ReportContentDialog: ({ open }: { open: boolean }) => (open ? <div>Report dialog</div> : null),
}));
vi.mock('@/components/profile/tabs/OverviewTab', () => ({
  OverviewTab: ({ editor }: { editor?: React.ReactNode }) => <div>Overview{editor}</div>,
}));
vi.mock('@/components/profile/tabs/TravelTab', () => ({
  TravelTab: () => <div>Travel footprint</div>,
}));
vi.mock('@/hooks/useFootprintStats', () => ({
  usePublicFootprint: () => ({ shared: state.travelShared, isLoading: false }),
}));
vi.mock('@/hooks/useUserGroups', () => ({
  useUserGroups: () => ({ groups: [], isLoading: false }),
}));
vi.mock('@/hooks/useUserReviews', () => ({
  useUserReviews: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useCommunityPosts', () => ({
  useUserPostCount: () => ({ data: state.activityCount, isLoading: false }),
}));
vi.mock('@/components/profile/tabs/GroupsTab', () => ({ GroupsTab: () => <div>Groups</div> }));
vi.mock('@/components/profile/tabs/ContributionsTab', () => ({
  ContributionsTab: () => <div>Contributions</div>,
}));
vi.mock('@/components/status/StatusPicker', () => ({ StatusPicker: () => null }));
vi.mock('@/components/profile/tabs/DatingTab', () => ({
  DatingTab: () => <div>Dating layer</div>,
}));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useDatingLayerVisible: () => state.datingVisible,
}));
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
        <Route path="*" element={<div>ELSEWHERE</div>} />
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
    state.signedOut = false;
    state.datingVisible = false;
    state.travelShared = true;
    state.activityCount = 1;
    state.savePending.mockReset().mockResolvedValue(true);
  });
  it('renders not-found state', () => {
    state.missing = true;
    renderAt('/user/u1');
    expect(screen.getByText('Profile not found')).toBeTruthy();
  });
  it('asks a signed-out visitor to sign in instead of claiming the profile is missing', () => {
    state.signedOut = true;
    state.missing = true;
    renderAt('/user/u2/travel');
    expect(screen.getByRole('heading', { name: 'Sign in to view this profile' })).toBeTruthy();
    expect(screen.queryByText('Profile not found')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
      '/auth?redirect=%2Fuser%2Fu2%2Ftravel',
    );
  });
  it('shows three identity tabs and no settings or progress tab', () => {
    renderAt('/user/u1');
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Overview', 'Travel', 'Activity']);
  });
  it('hides Travel and Activity from a visitor when they are empty', () => {
    state.target = 'u2';
    state.travelShared = false;
    state.activityCount = 0;
    renderAt('/user/u2/activity');
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Overview']);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });
  it('adds a Dating tab only when the dating layer is visible to the viewer', () => {
    state.target = 'u2';
    renderAt('/user/u2/dating');
    expect(screen.queryByRole('tab', { name: 'Dating' })).toBeNull();
    expect(screen.queryByText('Dating layer')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });
  it('opens the Dating tab for an opted-in pair', () => {
    state.target = 'u2';
    state.datingVisible = true;
    renderAt('/user/u2/dating');
    expect(screen.getByRole('tab', { name: 'Dating' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Dating layer')).toBeTruthy();
  });
  it.each([
    ['/user/u1/account', '/settings/security'],
    ['/user/u1/progress', '/hub/progress'],
    ['/user/u1/groups', '/user/u1/activity'],
    ['/user/u1/contributions', '/user/u1/activity'],
  ])('moves the retired %s tab to %s', async (source, target) => {
    renderAt(source);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(target));
  });
  it('keeps visitors on the overview for owner-only tab names', () => {
    state.target = 'u2';
    renderAt('/user/u2/account?edit=avatar');
    expect(screen.getByTestId('location').textContent).toBe('/user/u2/account?edit=avatar');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change avatar' })).toBeNull();
  });
  it('lets a signed-in visitor report the profile', () => {
    state.target = 'u2';
    renderAt('/user/u2');
    fireEvent.click(screen.getByRole('button', { name: 'Report profile' }));
    expect(screen.getByText('Report dialog')).toBeTruthy();
  });
  it('opens the avatar editor in place', async () => {
    renderAt('/user/u1');
    fireEvent.click(screen.getByRole('button', { name: 'Change avatar' }));
    expect(await screen.findByTestId('editor')).toHaveTextContent('avatar');
    expect(screen.getByTestId('location')).toHaveTextContent('/user/u1?edit=avatar');
  });
  it('no longer mounts settings editors on the profile', () => {
    renderAt('/user/u1?edit=privacy');
    expect(screen.queryByTestId('editor')).toBeNull();
  });
  it('hides the editor and owner-only fields while previewing as public', async () => {
    renderAt('/user/u1?edit=avatar');
    expect(await screen.findByTestId('editor')).toHaveTextContent('avatar');
    expect(screen.getByText('owner-only-pronouns')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    await waitFor(() => expect(screen.queryByTestId('editor')).toBeNull());
    expect(state.savePending).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('owner-only-pronouns')).toBeNull();
  });
  it('keeps the current editor and lens when a pending save fails', async () => {
    state.savePending.mockResolvedValue(false);
    renderAt('/user/u1?edit=avatar');
    await screen.findByTestId('editor');
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    await waitFor(() => expect(state.savePending).toHaveBeenCalled());
    expect(screen.getByTestId('editor')).toHaveTextContent('avatar');
  });
  it('shows a visibility notice instead of the private profile under a public lens', async () => {
    state.privateMode = true;
    renderAt('/user/u1');
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    await screen.findByText(
      'This profile isn’t visible in this view. Switch to You to continue editing.',
    );
    expect(screen.queryByText('owner-only-pronouns')).toBeNull();
  });
});
