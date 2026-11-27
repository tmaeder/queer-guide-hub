import { AGE_BANDS } from '@/assets/intimate/options';

/** Whole years between an ISO date of birth and `now`. Null when unparseable. */
export function ageFromDob(dob: string | null | undefined, now = new Date()): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age >= 0 ? age : null;
}

/** The AGE_BANDS entry an age falls in; null under 18. */
export function ageBandFromAge(age: number | null): (typeof AGE_BANDS)[number] | null {
  if (age === null || age < 18) return null;
  for (const band of AGE_BANDS) {
    if (band.endsWith('+')) return band;
    const [lo, hi = lo] = band.split('-').map(Number);
    if (age >= lo && age <= hi) return band;
  }
  return null;
}

export const ageBandFromDob = (dob: string | null | undefined, now?: Date) =>
  ageBandFromAge(ageFromDob(dob, now));
