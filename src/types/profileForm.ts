import type { Profile } from '@/hooks/useProfile';

export interface ComingOutStatus {
  family: string;
  friends: string;
  work: string;
  public: string;
}

export interface PrivacySettings {
  profile_visibility: string;
  email_visible: boolean;
  phone_visible: boolean;
  identity_visibility?: string;
  relationships_visibility?: string;
  travel_visibility?: string;
  coming_out_visibility?: string;
  appear_in_recognition?: boolean;
  /** public | friends | private — who sees pronouns (default public). */
  pronouns_visibility?: string;
}

export interface ProfileFormData {
  // Basic
  display_name: string;
  first_name: string;
  last_name: string;
  chosen_name: string;
  name_pronunciation: string;
  pronouns: string;
  /** Ordered pronoun sets — source of truth; `pronouns` is the derived display string. */
  pronoun_tags: string[];
  bio: string;
  location: string;
  date_of_birth: string;
  age_range: string;
  occupation: string;
  education: string;
  phone: string;
  website: string;

  // Identity
  gender_identity: string;
  sexual_orientation: string;
  coming_out_status: ComingOutStatus;
  chosen_family_status: string;
  disability_status: string;
  neurodivergent_status: string;
  cultural_background: string[];
  languages: string[];

  // Relationships — dating/intimacy preferences live in the opt-in Intimate module
  romantic_orientation: string;
  current_relationship_status: string;
  relationship_style: string;

  // Privacy
  privacy_settings: PrivacySettings;
  user_mode: string;
}

const DEFAULT_COMING_OUT: ComingOutStatus = {
  family: 'not_out',
  friends: 'not_out',
  work: 'not_out',
  public: 'not_out',
};

const DEFAULT_PRIVACY: PrivacySettings = {
  profile_visibility: 'public',
  email_visible: false,
  phone_visible: false,
  identity_visibility: 'friends',
  relationships_visibility: 'friends',
  travel_visibility: 'public',
  coming_out_visibility: 'private',
  appear_in_recognition: false,
  pronouns_visibility: 'public',
};

function str(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function strArr(val: unknown): string[] {
  return Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : [];
}

export function initFormData(profile: Profile | null | undefined): ProfileFormData {
  if (!profile) {
    return {
      display_name: '', first_name: '', last_name: '', chosen_name: '',
      name_pronunciation: '', pronouns: '', pronoun_tags: [], bio: '', location: '',
      date_of_birth: '', age_range: '', occupation: '', education: '',
      phone: '', website: '',
      gender_identity: '', sexual_orientation: '',
      coming_out_status: DEFAULT_COMING_OUT,
      chosen_family_status: '', disability_status: '', neurodivergent_status: '',
      cultural_background: [], languages: [],
      romantic_orientation: '', current_relationship_status: '',
      relationship_style: '',
      privacy_settings: DEFAULT_PRIVACY,
      user_mode: 'exploration',
    };
  }

  const p = profile as Record<string, unknown>;
  const privacy = (p.privacy_settings ?? {}) as Partial<PrivacySettings>;
  const comingOut = (p.coming_out_status ?? DEFAULT_COMING_OUT) as Partial<ComingOutStatus>;

  return {
    display_name: str(p.display_name),
    first_name: str(p.first_name),
    last_name: str(p.last_name),
    chosen_name: str(p.chosen_name),
    name_pronunciation: str(p.name_pronunciation),
    pronouns: str(p.pronouns),
    pronoun_tags: strArr(p.pronoun_tags).length > 0
      ? strArr(p.pronoun_tags)
      : str(p.pronouns).trim()
        ? [str(p.pronouns).trim()]
        : [],
    bio: str(p.bio),
    location: str(p.location),
    date_of_birth: str(p.date_of_birth),
    age_range: str(p.age_range),
    occupation: str(p.occupation),
    education: str(p.education),
    phone: str(p.phone),
    website: str(p.website),

    gender_identity: str(p.gender_identity),
    sexual_orientation: str(p.sexual_orientation),
    coming_out_status: { ...DEFAULT_COMING_OUT, ...comingOut },
    chosen_family_status: str(p.chosen_family_status),
    disability_status: str(p.disability_status),
    neurodivergent_status: str(p.neurodivergent_status),
    cultural_background: strArr(p.cultural_background),
    languages: strArr((p.languages as Record<string, unknown>)?.list ?? p.languages),

    romantic_orientation: str(p.romantic_orientation),
    current_relationship_status: str(p.current_relationship_status),
    relationship_style: str(p.relationship_style),

    privacy_settings: { ...DEFAULT_PRIVACY, ...privacy },
    user_mode: str(p.user_mode) || 'exploration',
  };
}

/** Minimum age for the platform */
export function getMinAgeDate(): Date {
  const today = new Date();
  return new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
}

export function isValidDob(dateStr: string): boolean {
  if (!dateStr) return true; // optional field
  const date = new Date(dateStr);
  return date <= getMinAgeDate() && date >= new Date('1900-01-01');
}

/**
 * Weighted profile completion (0-100). Counts only fields that drive a visible
 * feature — identity that shows everywhere (You) plus the personalization signal
 * that powers search/trips/recs. Dead identity fields (gender, orientation,
 * relationship_style) deliberately do NOT count, so nudges point users at data
 * that actually improves their experience. (2026-06-06 profile rethink.)
 */
export function calculateCompletion(data: ProfileFormData, profile?: Profile | null): number {
  const p = (profile ?? {}) as Record<string, unknown>;

  const has = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') return Object.keys(v).length > 0;
    return typeof v === 'string' ? v.trim().length > 0 : !!v;
  };
  const ratio = (items: unknown[]) => items.filter(has).length / items.length;

  // Core (50%): the "You" surface shown across the app.
  const core = [data.display_name, data.pronouns, data.location, data.languages, p.avatar_url];
  // Signal (40%): personalization that powers search / trips / recommendations.
  const signal = [p.interests, p.travel_preferences, p.accessibility_needs, data.bio];
  // Extras (10%): nice-to-have context.
  const extras = [data.first_name, data.occupation];

  return Math.round(ratio(core) * 50 + ratio(signal) * 40 + ratio(extras) * 10);
}
