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

/**
 * Freigabe-Stufe — the multi-stage approval funnel for newly captured persons.
 * A client mirror of the SQL derivation in personality_freigabe_funnel() /
 * personalities_freigabe_queue() (migration 20260723000000). Keep the two in
 * sync. Unlike personalityStatus() above, the stage keys on `visibility` as the
 * truth for "published" (fresh commits keep review_status='approved' by column
 * default while still draft, so review_status alone would read them as green).
 */
export type FreigabeStufe =
  | 'erfasst'
  | 'in_pruefung'
  | 'freigabe_bereit'
  | 'veroeffentlicht'
  | 'abgelehnt';

/** Ordered stages of the forward funnel (Abgelehnt is a side sink, listed last). */
export const FREIGABE_STAGES: FreigabeStufe[] = [
  'erfasst',
  'in_pruefung',
  'freigabe_bereit',
  'veroeffentlicht',
  'abgelehnt',
];

export const FREIGABE_STAGE_META: Record<
  FreigabeStufe,
  { label: string; tone: AmpelTone; hint: string }
> = {
  erfasst: { label: 'Erfasst', tone: 'gray', hint: 'Entwurf, unvollständig — wartet auf Anreicherung' },
  in_pruefung: { label: 'In Prüfung', tone: 'yellow', hint: 'Braucht menschliche Entscheidung' },
  freigabe_bereit: { label: 'Freigabe bereit', tone: 'green', hint: 'Erfüllt Auto-Gate — wird veröffentlicht' },
  veroeffentlicht: { label: 'Veröffentlicht', tone: 'green', hint: 'Öffentlich sichtbar' },
  abgelehnt: { label: 'Abgelehnt', tone: 'red', hint: 'Archiviert / abgelehnt / Duplikat' },
};

export interface FreigabeStufeInput extends PersonalityStatusInput {
  visibility?: string | null;
  duplicate_of_id?: string | null;
  is_promotable?: boolean | null;
  has_open_review?: boolean | null;
}

/**
 * Derive the Freigabe-Stufe for a personality row. `is_promotable` (auto-gate
 * pass) and `has_open_review` come from the server (the queue selector supplies
 * them); when absent, freigabe_bereit degrades to erfasst — the SQL funnel is
 * authoritative, this is only for row badges.
 */
export function freigabeStufe(p: FreigabeStufeInput): {
  stage: FreigabeStufe;
  tone: AmpelTone;
  label: string;
} {
  let stage: FreigabeStufe;
  if (p.duplicate_of_id || p.review_status === 'archived' || p.review_status === 'rejected')
    stage = 'abgelehnt';
  else if (p.visibility === 'public') stage = 'veroeffentlicht';
  else if (p.needs_attention || p.has_open_review) stage = 'in_pruefung';
  else if (p.is_promotable) stage = 'freigabe_bereit';
  else stage = 'erfasst';
  const meta = FREIGABE_STAGE_META[stage];
  return { stage, tone: meta.tone, label: meta.label };
}
