export type Genitalia = 'penis' | 'vagina' | 'intersex' | 'prefer_not_to_say';

export interface IntimateProfile {
  id: string;
  opted_in_at: string | null;
  /** Own row only (useMyIntimateProfile). */
  presence_safety_acknowledged_at?: string | null;
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
  safer_sex_prefs: string[];
  discovery_city_id: string | null;
  discovery_active_until: string | null;
  moderation_status: string;
  last_active_at: string;
  /** Free-form preferences; `seeking` holds who the member is looking for. */
  dating_prefs?: { seeking?: IntimateSeeking } & Record<string, unknown>;
}

/** Who a member is looking for. Age bounds are AGE_BANDS values. */
export interface IntimateSeeking {
  genitalia?: string[];
  age_min?: string | null;
  age_max?: string | null;
  roles?: string[];
  body_types?: string[];
  /** Hanky colours wanted: cultural_variants.id → pocket. */
  hanky?: Record<string, 'left' | 'right' | 'both'>;
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
  shared?: { requirements_met?: boolean };
  /** Worn hanky colours, variant id → pocket. Attached client-side. */
  hanky?: Record<string, 'left' | 'right' | 'both'>;
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
  | 'safer-sex'
  | 'text'
  | 'review';
