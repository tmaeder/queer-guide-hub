/**
 * Personality "Ampel" (traffic-light) status — a curation-review signal ported
 * from the PHP tool's ampel_status. Derives one green/yellow/red/gray verdict
 * from the platform's structured governance fields (verification_status,
 * review_status, needs_attention) instead of the PHP free-text `flags`.
 *
 * Traffic-light colours are a sanctioned design exception (CLAUDE.md §
 * Documented exceptions — like TripSafetyBriefing): safety/curation legibility
 * over strict monochrome.
 */

export type AmpelTone = 'green' | 'yellow' | 'red' | 'gray';

export interface PersonalityStatusInput {
  verification_status?: string | null;
  review_status?: string | null;
  needs_attention?: boolean | null;
}

export interface PersonalityStatus {
  tone: AmpelTone;
  label: string;
}

export function personalityStatus(p: PersonalityStatusInput): PersonalityStatus {
  // review_status is the maintained curation signal here (pending / approved /
  // manually_verified / archived); verification_status is a legacy fallback.
  if (p.review_status === 'archived' || p.review_status === 'rejected' || p.verification_status === 'rejected')
    return { tone: 'red', label: 'Archiviert / gesperrt' };
  if (
    p.review_status === 'approved' ||
    p.review_status === 'manually_verified' ||
    p.verification_status === 'verified'
  )
    return { tone: 'green', label: 'Freigegeben' };
  if (p.needs_attention || p.review_status === 'pending' || p.verification_status === 'pending')
    return { tone: 'yellow', label: 'Zu prüfen' };
  return { tone: 'gray', label: 'Ohne Status' };
}

/** Maps the ampel tone onto the locked risk traffic-light levels, so the dot
 * colour comes from the single sanctioned palette (useRiskVisual) — no new hex.
 * `gray` has no risk equivalent; callers fall back to a muted token. */
export const AMPEL_RISK: Record<Exclude<AmpelTone, 'gray'>, 'low' | 'moderate' | 'high'> = {
  green: 'low',
  yellow: 'moderate',
  red: 'high',
};
