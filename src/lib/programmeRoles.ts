/**
 * Role of a programme CHILD inside its festival umbrella (`events.programme_role`).
 *
 * The DB CHECK `events_programme_role_check` is the authority; this list is drift-tested
 * against the migration that defines it (`src/lib/__tests__/programmeRoles.test.ts`).
 * Adding a role is a migration that re-cuts the CHECK plus an entry here, in one change.
 *
 * Replaces `pride_subtypes` as the per-child role: that vocabulary is Pride-only and no
 * admin surface could edit it, so a leather weekend or a film festival had no way to say
 * "this is the main party" or "this is a screening".
 */
export const PROGRAMME_ROLES = [
  'parade',
  'street_fair',
  'main_party',
  'party',
  'workshop',
  'screening',
  'talk',
  'award',
  'rally',
  'social',
  'sports',
  'market',
  'other',
] as const;

export type ProgrammeRole = (typeof PROGRAMME_ROLES)[number];

export const PROGRAMME_ROLE_LABELS: Record<ProgrammeRole, string> = {
  parade: 'Parade / march',
  street_fair: 'Street fair',
  main_party: 'Main party',
  party: 'Party',
  workshop: 'Workshop',
  screening: 'Screening',
  talk: 'Talk / panel',
  award: 'Award / contest',
  rally: 'Rally / protest',
  social: 'Social / meetup',
  sports: 'Sports',
  market: 'Market',
  other: 'Other',
};

export function isProgrammeRole(value: unknown): value is ProgrammeRole {
  return typeof value === 'string' && (PROGRAMME_ROLES as readonly string[]).includes(value);
}
