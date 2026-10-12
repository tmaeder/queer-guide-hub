/** Editors belong to the authenticated owner's profile, never a visitor's profile. */
export type ProfileEditorSection =
  'profile' | 'status' | 'dating' | 'privacy' | 'account' | 'avatar' | 'travel';

const LEGACY_SECTIONS: Record<string, ProfileEditorSection> = {
  profile: 'profile',
  basic: 'profile',
  status: 'status',
  vibe: 'status',
  intent: 'status',
  identity: 'dating',
  dating: 'dating',
  relationships: 'dating',
  intimate: 'dating',
  account: 'account',
  notifications: 'account',
  privacy: 'privacy',
  travel: 'travel',
  avatar: 'avatar',
};

export function profileEditorSection(value: string | null): ProfileEditorSection | null {
  return value ? (LEGACY_SECTIONS[value] ?? null) : null;
}

export function profileEditPath(userId: string, section: ProfileEditorSection = 'profile'): string {
  const base = `/user/${encodeURIComponent(userId)}`;
  if (section === 'account') return `${base}/account`;
  if (section === 'travel') return `${base}/travel?edit=travel`;
  return `${base}?edit=${section}`;
}

export function legacySettingsDestination(userId: string, search: string, privacy = false): string {
  const params = new URLSearchParams(search);
  const section = privacy
    ? 'privacy'
    : (profileEditorSection(params.get('section')) ??
      profileEditorSection(params.get('tab')) ??
      'profile');
  params.delete('section');
  params.delete('tab');
  const path = profileEditPath(userId, section);
  const [pathname, targetSearch] = path.split('?');
  for (const [key, value] of new URLSearchParams(targetSearch)) params.set(key, value);
  // Account links identify their subsection without starting a profile editor.
  if (section === 'account') params.delete('edit');
  return `${pathname}${params.size ? `?${params.toString()}` : ''}`;
}
