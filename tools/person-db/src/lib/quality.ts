// Datenqualitäts-Ampel — reine, testbare Logik (keine React-/DOM-Abhängigkeit).
//
// Eine Ampel (Freigabe-Reife) + drei Dimensionen (Prüftiefe, Herkunft,
// Vollständigkeit). Alles aus vorhandenen personalities-Feldern abgeleitet —
// kein Schema-Umbau, Tool bleibt read-only. Der lokale „checked"-Zustand
// (localStorage) wird getrennt gehalten, weil er nicht persistent in der DB steht.
import type { Personality } from '../types'

export type QualityTier = 'red' | 'yellow' | 'green' | 'blue'

export type Provenance = 'auto' | 'manual' | 'mixed' | 'unknown'

export interface CompletenessField {
  key: string
  label: string
  present: boolean
}

export interface QualityAssessment {
  tier: QualityTier
  label: string
  /** Warum diese Stufe — v.a. bei Rot die harten Gründe. */
  reasons: string[]
  /** Prüftiefe: zwei unabhängige DB-Stempel. */
  stamps: { review: boolean; verification: boolean }
  provenance: Provenance
  completeness: { have: number; total: number; fields: CompletenessField[]; missing: string[] }
  /** Lokal (in diesem Browser) als geprüft markiert — kein DB-Signal. */
  localChecked: boolean
}

const TIER_LABEL: Record<QualityTier, string> = {
  red: 'Nicht freigabereif',
  yellow: 'Erfasst, ungeprüft',
  green: 'Geprüft',
  blue: 'Doppelt bestätigt',
}

const PROVENANCE_LABEL: Record<Provenance, string> = {
  auto: 'Automatisch (Wikidata)',
  manual: 'Manuell erfasst',
  mixed: 'Gemischt',
  unknown: 'Herkunft unklar',
}

export function provenanceLabel(p: Provenance): string {
  return PROVENANCE_LABEL[p]
}

const has = (v: unknown): boolean =>
  v != null && v !== '' && !(Array.isArray(v) && v.length === 0)

/** Ein Beleg = mindestens eine externe Referenz. */
function hasSource(p: Personality): boolean {
  return has(p.wikipedia_url) || has(p.website_url) || has(p.wikidata_qid)
}

/** Beruf ODER Tätigkeit(en) zählt als „Rolle/Beruf vorhanden". */
function hasRole(p: Personality): boolean {
  return has(p.profession) || has(p.roles)
}

/** Prüfstempel aus den zwei unabhängigen DB-Statusfeldern. */
export function stampsOf(p: Personality): { review: boolean; verification: boolean } {
  const review =
    p.review_status === 'manually_verified' || p.review_status === 'approved'
  const verification = p.verification_status === 'verified'
  return { review, verification }
}

/** Herkunfts-Heuristik (bewusst grob, in der UI als Schätzung gelabelt). */
export function provenanceOf(p: Personality): Provenance {
  const wiki = has(p.wikidata_qid)
  const manual = has(p.website_url) // vom Redakteur ergänzter Link
  if (wiki && manual) return 'mixed'
  if (wiki) return 'auto'
  if (manual || has(p.wikipedia_url)) return 'manual'
  return 'unknown'
}

/** Sechs Pflicht-/Kernfelder für die Vollständigkeit. */
export function completenessOf(p: Personality): QualityAssessment['completeness'] {
  const fields: CompletenessField[] = [
    { key: 'name', label: 'Name', present: has(p.name) },
    { key: 'birth', label: 'Geburtsdatum', present: has(p.birth_date) },
    { key: 'role', label: 'Beruf/Tätigkeit', present: hasRole(p) },
    { key: 'lgbti', label: 'LGBTI-Bezug', present: has(p.lgbti_connection) },
    { key: 'image', label: 'Bild', present: has(p.image_url) },
    { key: 'source', label: 'Beleg', present: hasSource(p) },
  ]
  const have = fields.filter((f) => f.present).length
  const missing = fields.filter((f) => !f.present).map((f) => f.label)
  return { have, total: fields.length, fields, missing }
}

/**
 * Gesamtbewertung.
 *
 * Rot  = nicht freigabereif: needs_attention, Duplikat, disputed, oder ein
 *        hartes Pflichtfeld fehlt (Name / LGBTI-Bezug / Beleg).
 * Gelb = vollständig genug, aber kein Prüfstempel.
 * Grün = ein Prüfstempel (Review ODER Verifikation).
 * Blau = beide Stempel (4-Augen).
 */
export function assessQuality(p: Personality, localChecked = false): QualityAssessment {
  const stamps = stampsOf(p)
  const provenance = provenanceOf(p)
  const completeness = completenessOf(p)

  const reasons: string[] = []
  if (p.needs_attention) reasons.push('Als „needs attention" markiert')
  if (has(p.duplicate_of_id)) reasons.push('Als Duplikat markiert')
  if (p.verification_status === 'disputed') reasons.push('Verifizierung bestritten (disputed)')
  if (!has(p.name)) reasons.push('Name fehlt')
  if (!has(p.lgbti_connection)) reasons.push('LGBTI-Bezug fehlt')
  if (!hasSource(p)) reasons.push('Kein Beleg (Quelle) hinterlegt')

  let tier: QualityTier
  if (reasons.length > 0) {
    tier = 'red'
  } else if (stamps.review && stamps.verification) {
    tier = 'blue'
  } else if (stamps.review || stamps.verification) {
    tier = 'green'
    reasons.push('Ein Prüfstempel offen — für „doppelt bestätigt" beide setzen')
  } else {
    tier = 'yellow'
    reasons.push('Noch kein Prüfstempel (Review + Verifizierung offen)')
  }

  return {
    tier,
    label: TIER_LABEL[tier],
    reasons,
    stamps,
    provenance,
    completeness,
    localChecked,
  }
}
