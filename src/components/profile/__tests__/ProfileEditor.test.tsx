/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link, useSearchParams } from 'react-router';

const state = vi.hoisted(() => ({ updateProfile: vi.fn(), navigate: vi.fn(), onClose: vi.fn() }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => state.navigate }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'alex@example.com' }, hasPasskey: false }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ updateProfile: state.updateProfile, refetchProfile: vi.fn() }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/profile/settings/BasicInfoTab', () => ({
  BasicInfoTab: ({
    formData,
    onChange,
  }: {
    formData: { bio: string };
    onChange: (field: string, value: string) => void;
  }) => (
    <input
      aria-label="Bio"
      value={formData.bio}
      onChange={(event) => onChange('bio', event.target.value)}
    />
  ),
}));
vi.mock('@/components/profile/settings/IdentityTab', () => ({
  IdentityTab: () => <div>Identity editor</div>,
}));
vi.mock('@/components/profile/settings/PrivacyTab', () => ({
  PrivacyTab: () => <div>Privacy editor</div>,
}));
vi.mock('@/components/profile/settings/ModerationSettings', () => ({
  ModerationSettings: () => null,
}));
vi.mock('@/components/profile/settings/DangerZone', () => ({ DangerZone: () => null }));
vi.mock('@/components/profile/IntimateTab', () => ({ IntimateTab: () => null }));
vi.mock('@/components/profile/TravelPreferencesEditor', () => ({
  TravelPreferencesEditor: () => null,
}));
vi.mock('@/components/status/StatusEditor', () => ({ StatusEditor: () => null }));
vi.mock('@/components/profile/AvatarChooser', () => ({
  AvatarChooser: () => <div>Avatar editor</div>,
}));
vi.mock('@/components/profile/UsernamePanel', () => ({ UsernamePanel: () => null }));
vi.mock('@/components/profile/ChangePasswordPanel', () => ({ ChangePasswordPanel: () => null }));
vi.mock('@/components/profile/PreferencesMirrorCard', () => ({
  PreferencesMirrorCard: () => null,
}));
vi.mock('@/components/profile/TravelForwardingSettings', () => ({
  TravelForwardingSettings: () => null,
}));
vi.mock('@/components/profile/PushNotificationSettings', () => ({
  PushNotificationSettings: () => null,
}));
vi.mock('@/components/trips/DocumentsList', () => ({ DocumentsList: () => null }));

import Settings from '../ProfileEditor';
import { profileEditorSection } from '@/lib/profileEditing';

function Editor() {
  const [params] = useSearchParams();
  return (
    <Settings
      section={profileEditorSection(params.get('edit')) ?? 'profile'}
      onClose={state.onClose}
    />
  );
}

function renderAt(path = '/user/u1?edit=profile') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Editor />
      <Link to="/user/u1?edit=privacy">Open privacy</Link>
    </MemoryRouter>,
  );
}

describe('Settings workspace', () => {
  beforeEach(() => {
    state.updateProfile.mockReset().mockResolvedValue({ error: null });
    state.onClose.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('renders one contextual editor with save feedback and no duplicate Settings header', () => {
    renderAt();
    expect(screen.getByRole('heading', { name: 'Edit profile' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Profile changes saved');
  });

  it.each([
    ['?edit=privacy', 'Privacy editor'],
    ['?edit=dating', 'Identity editor'],
    ['?edit=avatar', 'Avatar editor'],
  ])('preserves the %s editor deep link', (query, editor) => {
    renderAt(`/user/u1${query}`);
    expect(screen.getByText(editor)).toBeTruthy();
  });

  it('follows a new section link within the mounted workspace and keeps only one editor open', () => {
    renderAt('/user/u1?edit=profile');
    expect(screen.getByRole('textbox', { name: 'Bio' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Open privacy' }));
    expect(screen.getByText('Privacy editor')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Bio' })).toBeNull();
  });

  it('debounces profile changes and reports a successful autosave', async () => {
    vi.useFakeTimers();
    renderAt('/user/u1?edit=profile');
    fireEvent.change(screen.getByRole('textbox', { name: 'Bio' }), {
      target: { value: 'My updated bio' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    expect(state.updateProfile).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(state.updateProfile).toHaveBeenCalledTimes(1);
    expect(state.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ bio: 'My updated bio' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Profile changes saved');
  });
  it('flushes pending changes before closing', async () => {
    renderAt();
    fireEvent.change(screen.getByRole('textbox', { name: 'Bio' }), {
      target: { value: 'Pending edit' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(state.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ bio: 'Pending edit' }),
    );
    expect(state.onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the editor open when the final save fails', async () => {
    state.updateProfile.mockResolvedValue({ error: 'Failed', errorKind: 'unknown' });
    renderAt();
    fireEvent.change(screen.getByRole('textbox', { name: 'Bio' }), {
      target: { value: 'Pending edit' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(state.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Save failed');
  });
});
