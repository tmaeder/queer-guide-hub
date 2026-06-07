/**
 * Shared safety gating for hybrid-by-confidence automated content.
 *
 * A destination where same-sex activity is criminalized (or carries a death
 * penalty) is "safety-sensitive": auto-generated editorial about it must always
 * be routed to human review regardless of model confidence. Used by both
 * pipeline-enrich-country-editorial (routing) and event-agentic-enrich (safety
 * context), so the predicate lives in one place.
 */

export interface CriminalizationLike {
  legal?: boolean | null
  penalty?: string | null
  death_penalty?: string | null
}

/** True when the country criminalizes same-sex activity or imposes a death penalty. */
export function isSafetySensitiveCountry(crim: CriminalizationLike | null | undefined): boolean {
  if (!crim) return false
  if (crim.legal === false) return true
  const dp = `${crim.death_penalty ?? ''} ${crim.penalty ?? ''}`
  return /death/i.test(dp)
}

/** Confidence at/above which generated editorial may auto-publish (else → review). */
export const AUTO_PUBLISH_CONFIDENCE = 0.8
