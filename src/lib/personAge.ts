/**
 * Age of a person — or null when any answer would be a fabrication.
 *
 * `/professions/Politician` published an "Age Range" of **32-434** and
 * `/professions/Writer` **31-155**, because the caller aged every personality
 * against *today*: `new Date().getFullYear() - birthYear`, with the row's own
 * `death_date` sitting unread beside it. A monarch born in 1592 is not 434.
 *
 * Two rules, both deliberate:
 *  - the end of a life is `death_date` when there is one, so the number is an
 *    age at death rather than a hypothetical;
 *  - an out-of-range result is DROPPED, not clamped. A clamped 122 renders as a
 *    fact about a person; a missing value renders as missing data, which is what
 *    a garbage `birth_date` actually is.
 *
 * `personalities.birth_date`/`death_date` are date columns, so callers pass the
 * raw string; an unparseable one is treated as absent for the same reason.
 */

/** Jeanne Calment, 122y 164d — the oldest verified human lifespan. */
export const MAX_HUMAN_AGE = 122;

export function calculateAge(birthDate?: string | null, deathDate?: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  let end: Date;
  if (deathDate) {
    end = new Date(deathDate);
    if (Number.isNaN(end.getTime())) return null;
  } else {
    end = new Date();
  }

  let age = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) age -= 1;

  if (age < 0 || age > MAX_HUMAN_AGE) return null;
  return age;
}
