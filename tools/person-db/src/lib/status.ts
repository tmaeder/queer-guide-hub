import type { Personality } from '../types'

export type PStatus = 'green' | 'yellow' | 'red'

// Traffic-light status.
// green  = sauber online (öffentlich, kein Duplikat, keine offene Prüfung)
// yellow = zu klären → sollte offline bleiben, bis die Situation geklärt ist
//          (Duplikat ODER needs_attention ODER nicht öffentlich)
// red    = hart geblockt (archiviert)
export function personStatus(p: Personality): { status: PStatus; label: string } {
  if (p.review_status === 'archived') return { status: 'red', label: 'Geblockt — archiviert' }
  if (p.duplicate_of_id) return { status: 'yellow', label: 'Zu klären — Duplikat (sollte offline bleiben)' }
  if (p.needs_attention) return { status: 'yellow', label: 'Zu bearbeiten — needs_attention (sollte offline bleiben)' }
  if (p.visibility !== 'public') return { status: 'yellow', label: 'Zu bearbeiten — nicht öffentlich' }
  return { status: 'green', label: 'Online — sauber öffentlich sichtbar' }
}

// Rule-based pre-check of a draft (stand-in until a real LLM check lands in v2).
export function plausibilityCheck(d: Record<string, unknown>): string[] {
  const issues: string[] = []
  const s = (k: string) => String(d[k] ?? '').trim()
  if (!s('name')) issues.push('Kein Name.')
  if (!s('slug')) issues.push('Kein Slug.')
  const birth = s('birth_date')
  const death = s('death_date')
  if (death && d.is_living) issues.push('Todesdatum gesetzt, aber als lebend markiert.')
  if (birth && death && birth > death) issues.push('Geburtsdatum liegt nach dem Todesdatum.')
  if (!birth) issues.push('Kein Geburtsdatum.')
  if (!s('description') && !s('bio')) issues.push('Weder Beschreibung noch Bio.')
  if (!s('lgbti_connection')) issues.push('Kein LGBTI-Bezug angegeben.')
  if (!s('image_url')) issues.push('Kein Bild.')
  if (!s('profession')) issues.push('Kein Beruf.')
  if (s('visibility') === 'public' && !s('lgbti_connection'))
    issues.push('Öffentlich, aber ohne LGBTI-Bezug.')
  return issues
}
