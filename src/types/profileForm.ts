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
}

export interface ProfileFormData {
  // Basic
  display_name: string;
  first_name: string;
  last_name: string;
  chosen_name: string;
  name_pronunciation: string;
  pronouns: string;
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

  // Relationships
  romantic_orientation: string;
  current_relationship_status: string;
  relationship_style: string;
  romance_style: string;
  physical_affection_preference: string;
  sexual_frequency_preference: string;
  communication_about_sex: string;
  sexual_exploration_openness: string;
  sexual_health_status: string;
  kink_experience_level: string;
  bdsm_role: string;
  jealousy_comfort_level: string;

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
      name_pronunciation: '', pronouns: '', bio: '', location: '',
      date_of_birth: '', age_range: '', occupation: '', education: '',
      phone: '', website: '',
      gender_identity: '', sexual_orientation: '',
      coming_out_status: DEFAULT_COMING_OUT,
      chosen_family_status: '', disability_status: '', neurodivergent_status: '',
      cultural_background: [], languages: [],
      romantic_orientation: '', current_relationship_status: '',
      relationship_style: '', romance_style: '', physical_affection_preference: '',
      sexual_frequency_preference: '', communication_about_sex: '',
      sexual_exploration_openness: '', sexual_health_status: '',
      kink_experience_level: '', bdsm_role: '', jealousy_comfort_level: '',
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
    romance_style: str(p.romance_style),
    physical_affection_preference: str(p.physical_affection_preference),
    sexual_frequency_preference: str(p.sexual_frequency_preference),
    communication_about_sex: str(p.communication_about_sex),
    sexual_exploration_openness: str(p.sexual_exploration_openness),
    sexual_health_status: str(p.sexual_health_status),
    kink_experience_level: str(p.kink_experience_level),
    bdsm_role: str(p.bdsm_role),
    jealousy_comfort_level: str(p.jealousy_comfort_level),

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

/** Weighted profile completion (0-100) */
export function calculateCompletion(data: ProfileFormData): number {
  const core = [data.display_name, data.bio, data.location, data.pronouns, data.gender_identity];
  const extended = [data.first_name, data.last_name, data.age_range, data.occupation, data.education, data.sexual_orientation];
  const optional = [data.romantic_orientation, data.current_relationship_status, data.relationship_style, data.chosen_family_status];

  const filled = (fields: string[]) => fields.filter(f => f?.trim()).length;

  const coreScore = (filled(core) / core.length) * 60;
  const extScore = (filled(extended) / extended.length) * 30;
  const optScore = (filled(optional) / optional.length) * 10;

  return Math.round(coreScore + extScore + optScore);
}
