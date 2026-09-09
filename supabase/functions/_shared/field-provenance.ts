// Merging a recomputed provenance entry over the stored one.
//
// WHY THIS EXISTS. `field_provenance.<field>` is a SHARED jsonb subtree with
// several writers: the corroboration crons compute `{candidates, value,
// confidence, sources, corroborated, conflict}`, while repairs and backfills
// stamp their own keys beside it (`retracted`, `source: 'derived:city_centroid'`,
// rank-fix markers). A fuser returns only the keys it computes, so assigning its
// result directly deletes everything else under that field.
//
// Measured on prod 2026-09-09, one day after 20360201100100 retracted 186
// physically-impossible city scalars into `field_provenance.<col>.retracted`:
//
//   area markers      181 -> 129
//   elevation markers   1 -> 0
//   population markers  4 -> 3
//   columns refilled    0
//
// `city-corroboration` was erasing the retraction record — the only surviving
// copy of the pre-repair value — on its nightly pass. The gate built on top of
// it, `city_scalar_defects().retracted_pending_refill`, counts rows that still
// carry a marker, so deleting markers drives that key toward 0 and it reads
// "everything refilled" when nothing did: absence of evidence recorded as
// evidence of absence.
//
// The same shape is live on `events`: `event-corroboration` builds its
// provenance from `{}` and replaces the whole column, and of the 219 events it
// has touched only 78 still carry the `latitude.source='derived:%'` stamp that
// `run_event_geo_fill` wrote — 141 lost it while keeping the coordinates it
// described. That path is NOT changed here, because rebuilding from scratch may
// be deliberate there and the fix is a design decision, not a one-liner.

/** A provenance entry. Open-ended by design — writers other than the fuser add keys. */
export type FieldProvEntry = Record<string, unknown>

/**
 * Recomputed keys win; every other key on the stored entry survives.
 *
 * Shallow on purpose. A deep merge would silently resurrect stale members of
 * `candidates` (an array the fuser rebuilds wholesale and must be free to
 * shrink), which is the opposite failure: keeping a source that no longer
 * asserts anything.
 *
 * `existing` is typed `unknown` and shape-checked rather than trusted. This is
 * jsonb read back from Postgres: nothing guarantees the entry is an object, and
 * spreading a string yields indexed characters while spreading an array yields
 * numeric keys — both of which would corrupt the entry silently. Same hazard the
 * SQL side guards with `_jsonb_obj`.
 */
export function mergeFieldProv<T extends object>(
  existing: unknown,
  fused: T,
): T & FieldProvEntry {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as FieldProvEntry)
      : {}
  // `T & FieldProvEntry`, not `T`: the whole point is that the result carries
  // keys the fuser knows nothing about. Returning plain `T` types away the very
  // thing being preserved — and a caller reading `out.retracted` would get a
  // compile error for a key that is provably present at runtime.
  return { ...base, ...fused }
}
