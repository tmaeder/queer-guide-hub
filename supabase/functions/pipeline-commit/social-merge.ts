/**
 * Merge incoming social links onto an entity's existing `social_links`.
 *
 * Existing non-empty values WIN per key: a link already on the row may have been
 * set by an editor or an earlier, better source, and a re-ingest must not
 * silently replace it. Incoming values fill keys that are absent or empty.
 *
 * Returns the merged object, or null when nothing would change. The previous
 * inline version compared KEY COUNTS to decide "no change", so an empty value
 * under an existing key could never be filled, while a new key let every
 * incoming value overwrite the existing ones in the same write.
 */
export function mergeSocialLinks(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const base: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {}
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return null
  let changed = false
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value !== 'string' || !value.trim()) continue
    const cur = base[key]
    if (typeof cur === 'string' && cur.trim()) continue
    base[key] = value.trim()
    changed = true
  }
  return changed ? base : null
}
