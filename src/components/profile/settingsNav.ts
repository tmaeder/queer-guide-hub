import {
  Bell,
  Download,
  Fingerprint,
  Heart,
  KeyRound,
  Palette,
  Plane,
  Shield,
  User,
  UserRound,
} from '@/components/icons';
import type { SettingsSection } from '@/lib/profileEditing';

/** Settings groups: who you are, how the site works for you, your account. */
export const SETTINGS_GROUPS: { label: string; sections: SettingsSection[] }[] = [
  { label: 'You', sections: ['profile', 'body', 'identity', 'dating'] },
  { label: 'Preferences', sections: ['travel', 'notifications', 'display'] },
  { label: 'Account', sections: ['privacy', 'security', 'data'] },
];

export const SETTINGS_NAV: Record<SettingsSection, { label: string; icon: typeof User }> = {
  profile: { label: 'Profile', icon: User },
  identity: { label: 'Identity', icon: Fingerprint },
  dating: { label: 'Dating & 18+', icon: Heart },
  body: { label: 'Body & about', icon: UserRound },
  privacy: { label: 'Privacy & visibility', icon: Shield },
  security: { label: 'Sign-in & security', icon: KeyRound },
  notifications: { label: 'Notifications', icon: Bell },
  travel: { label: 'Travel', icon: Plane },
  display: { label: 'Language & display', icon: Palette },
  data: { label: 'Your data', icon: Download },
};
