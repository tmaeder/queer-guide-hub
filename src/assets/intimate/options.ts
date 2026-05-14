// Controlled vocabularies for the intimate-profile add-on.

export const GENITALIA_OPTIONS = [
  { value: 'penis',                label: 'Penis' },
  { value: 'vagina',               label: 'Vagina' },
  { value: 'intersex',             label: 'Intersex' },
  { value: 'prefer_not_to_say',    label: 'Prefer not to say' },
] as const;

export const AGE_BANDS = [
  '18','19-20','21-24','25-29','30-34','35-39','40-49','50-59','60-69','70+',
] as const;

export const BODY_TYPES = [
  'slim','average','athletic','muscular','bear','chub','twink','otter',
] as const;

export const ROLES = [
  'top','bottom','vers','vers-top','vers-bottom','side','switch','dom','sub',
] as const;

// v1 baseline — expand via unified_tags(category='intimate_kink') once seeded.
export const INTO_TAGS = [
  'oral','anal','kissing','fisting','rimming','toys','roleplay','public','group',
  'cuddling','massage','sensual','rough','bondage','spanking','leather','rubber',
  'edging','tantra','tickling',
] as const;

export const LIMITS = INTO_TAGS;

export const SAFER_SEX_PREFS = [
  'condoms_always','condoms_sometimes','prep','doxypep','undetectable','tested_recently',
] as const;

export const SIZE_CM_OPTIONS = Array.from({ length: 16 }, (_, i) => i + 10); // 10..25
