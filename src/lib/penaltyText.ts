/**
 * The bracketed addition to a criminalisation penalty, or '' when it adds
 * nothing.
 *
 * `lgbti_criminalization.max_prison` is a CATEGORY label, not a number:
 * measured on prod the values are "Years", "Life in prison", "Unknown",
 * "Varies" and "No". Appended verbatim it published "Up to 8 years
 * imprisonment (Years)" on 24 countries, plus "(Unknown)" and "(No)", and
 * "10 years to life in prison (Life in prison)". Only a label that says
 * something the penalty does not already say is kept.
 */
const BARE_CATEGORY = /^(years?|unknown|varies|no|none|n\/a)$/i;

export function maxPrisonSuffix(penalty: string | null | undefined, maxPrison: unknown): string {
  if (typeof maxPrison !== 'string') return '';
  const max = maxPrison.trim();
  if (!max || BARE_CATEGORY.test(max)) return '';
  if ((penalty ?? '').toLowerCase().includes(max.toLowerCase())) return '';
  return ` (${max})`;
}
