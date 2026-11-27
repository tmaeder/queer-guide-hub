/** Vibes a member can pick; stored in `profiles.interests`, read by search ranking. */
export const VIBES = [
  'cruisy',
  'artsy',
  'mixed',
  'leather',
  'family-friendly',
  'sober',
  'kink',
  'drag',
  'intellectual',
  'queer-femme',
  'trans-friendly',
  'alternative',
  'cozy',
  'dance-floor',
] as const;

/** Languages a member speaks; stored in `profiles.languages` as ISO 639-1 codes. */
export const SPOKEN_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
];

export const vibeLabel = (v: string) => v.replace(/-/g, ' ');
