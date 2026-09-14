import type { ReviewQueueCohort } from '@/hooks/useReviewQueueCohorts';

/**
 * Presentation helpers for the Quality review queue.
 *
 * They live outside the components that use them so those files export only
 * components (react-refresh/only-export-components), and so the behaviour can
 * be tested without mounting anything.
 */

/**
 * Quality titles arrive pre-joined server-side as `"<entity name> — <field>"`.
 * The field is also available structurally on `meta.field`, so rendering the
 * raw title prints it twice and pushes the entity name — the only part that
 * distinguishes one row from the next — out of the truncation window.
 *
 * Only a TRAILING occurrence of the row's own field is treated as the join, so
 * an entity whose name legitimately contains an em dash keeps it.
 */
export function splitQualityTitle(
  title: string,
  field: unknown,
): { name: string; field: string | null } {
  if (typeof field !== 'string' || field.length === 0) return { name: title, field: null };
  const suffix = ` — ${field}`;
  return title.endsWith(suffix)
    ? { name: title.slice(0, -suffix.length), field }
    : { name: title, field };
}

/** `social_links.xvideos` -> `xvideos`, `accessibility_attributes` -> `accessibility attributes`. */
export function fieldBadgeLabel(field: string): string {
  const leaf = field.includes('.') ? field.slice(field.lastIndexOf('.') + 1) : field;
  return leaf.replace(/_/g, ' ');
}

/** `social_links.xvideos` -> `Xvideos link`, `accessibility_attributes` -> `Accessibility attributes`. */
export function cohortLabel(field: string): string {
  if (field.startsWith('social_links.')) {
    const platform = field.slice('social_links.'.length);
    return `${platform.charAt(0).toUpperCase()}${platform.slice(1)} link`;
  }
  const words = field.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * True when the cohort's average confidence says the producer could not
 * resolve these rows.
 *
 * A display hint, never a gate: a self-reported confidence cannot decide
 * anything — this repo has measured that twice, on the tag prose judge (16 of
 * its first 18 verdicts retracted, 13 of them wrong, every one at high
 * confidence) and on the relation verifier (~29% correct at confidence 1.000).
 * It does tell a reviewer which pile will fight back before they open it.
 *
 * A null average is absence of a score, not a low one, so it does not mark.
 */
export function isLowConfidence(c: Pick<ReviewQueueCohort, 'avg_confidence'>): boolean {
  return c.avg_confidence !== null && c.avg_confidence < 0.7;
}
