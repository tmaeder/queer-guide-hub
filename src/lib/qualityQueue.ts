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
