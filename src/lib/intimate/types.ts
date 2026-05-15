export type Genitalia = 'penis' | 'vagina' | 'intersex' | 'prefer_not_to_say';

export interface IntimateProfile {
  id: string;
  opted_in_at: string | null;
  consent_18plus_at: string | null;
  genitalia: Genitalia | null;
  genital_pictogram_key: string | null;
  size_cm: number | null;
  erection_angle_deg: number | null;
  body_pictogram_key: string | null;
  body_type: string | null;
  height_cm: number | null;
  age_band: string | null;
  role: string[];
  into_tags: string[];
  limits: string[];
  safer_sex_prefs: string[];
  discovery_city_id: string | null;
  discovery_active_until: string | null;
  moderation_status: string;
  last_active_at: string;
}

export interface IntimateDiscoveryCard {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  discovery_city_id: string | null;
  role: string[];
  into_tags: string[];
  body_type: string | null;
  age_band: string | null;
  height_cm: number | null;
  last_active_at: string;
}

export type WizardStep =
  | 'consent'
  | 'genitalia'
  | 'genital-pictogram'
  | 'size'
  | 'angle'
  | 'body-pictogram'
  | 'body-type'
  | 'age'
  | 'height'
  | 'role'
  | 'into'
  | 'limits'
  | 'safer-sex'
  | 'text'
  | 'review';
