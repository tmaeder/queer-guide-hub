/** Sections of the /settings page, in display order. */
export const SETTINGS_SECTIONS = [
  'profile',
  'body',
  'identity',
  'dating',
  'travel',
  'notifications',
  'display',
  'privacy',
  'security',
  'data',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Editors belong to the authenticated owner. `avatar` is the one editor that
 * stays inline on the profile page; everything else lives at /settings. */
export type ProfileEditorSection = SettingsSection | 'avatar';

const LEGACY_SECTIONS: Record<string, ProfileEditorSection> = {
  profile: 'profile',
  basic: 'profile',
  status: 'profile',
  vibe: 'profile',
  intent: 'profile',
  identity: 'identity',
  dating: 'dating',
  relationships: 'identity',
  intimate: 'dating',
  privacy: 'privacy',
  visibility: 'privacy',
  account: 'security',
  security: 'security',
  username: 'security',
  password: 'security',
  notifications: 'notifications',
  email: 'notifications',
  travel: 'travel',
  display: 'display',
  language: 'display',
  appearance: 'display',
  accessibility: 'display',
  documents: 'travel',
  data: 'data',
  avatar: 'avatar',
};

export function profileEditorSection(
  value: string | null | undefined,
): ProfileEditorSection | null {
  return value ? (LEGACY_SECTIONS[value] ?? null) : null;
}

export function isSettingsSection(value: string | null | undefined): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/** Locale-less path to the settings section (or the inline avatar editor). */
export function profileEditPath(
  userId: string,
  section: ProfileEditorSection = 'profile',
  field?: string,
): string {
  if (section === 'avatar') return `/user/${encodeURIComponent(userId)}?edit=avatar`;
  return `/settings/${section}${field ? `?field=${encodeURIComponent(field)}` : ''}`;
}

/** Maps every old settings URL (?section=, ?tab=, ?edit=) onto /settings/<section>. */
export function legacySettingsDestination(userId: string, search: string, privacy = false): string {
  const params = new URLSearchParams(search);
  const section = privacy
    ? 'privacy'
    : (profileEditorSection(params.get('section')) ??
      profileEditorSection(params.get('tab')) ??
      profileEditorSection(params.get('edit')) ??
      'profile');
  params.delete('section');
  params.delete('tab');
  params.delete('edit');
  const [pathname, targetSearch] = profileEditPath(userId, section).split('?');
  for (const [key, value] of new URLSearchParams(targetSearch)) params.set(key, value);
  return `${pathname}${params.size ? `?${params.toString()}` : ''}`;
}
