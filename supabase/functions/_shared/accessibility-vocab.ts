// Accessibility vocabulary — contradicting pairs and how to resolve them.
// Pure. No I/O. Imported by venue-consensus.ts, venue-accessibility-osm and
// amenity-truth-backfill, and mirrored into SQL by migration
// 20261111100000_accessibility_contradiction_guard.sql.
//
// WHY THIS MODULE EXISTS
// ----------------------
// `public.amenities` carries three NEGATIVE accessibility terms as first-class
// vocabulary — `not-wheelchair-accessible`, `not-step-free`,
// `no-accessible-restroom` — because "we checked and it is NOT accessible" is
// more useful to a disabled traveller than silence (20260801150524).
//
// venue-consensus.ts votes `accessibility_attributes` as `kind:'array'`, and
// array fields UNION their contributors: every source counts as agreeing and an
// array field can never register a conflict. So OSM `wheelchair=no` and Google
// `wheelchairAccessibleEntrance=true` would BOTH survive on the same venue and
// auto-commit at high confidence rather than gate to review. That was latent
// only because the column was empty on 26,861 of 26,867 venues; anything that
// starts writing accessibility makes it reachable.
//
// The migration that introduced the negatives states the stake: "a wrong access
// claim strands a disabled person at a door they cannot get through."

/**
 * Mutually exclusive accessibility claims, written **[positive, negative]**.
 *
 * THE ORDER IS LOAD-BEARING. `resolveContradictions` keeps index 1 — the
 * negative — when both are present. Writing a pair the other way round would
 * make a venue OSM says is inaccessible publish "wheelchair accessible", which
 * is the precise harm this file exists to prevent, and nothing downstream would
 * catch it. `accessibility-vocab.test.ts` asserts the polarity of both halves.
 *
 * Kept in step with `public.amenities.contradicts` by
 * `accessibility-vocab.drift.test.ts`, which parses the migration.
 */
export const ACCESSIBILITY_CONTRADICTIONS: ReadonlyArray<readonly [string, string]> = [
  ['wheelchair-accessible', 'not-wheelchair-accessible'],
  ['step-free-entrance', 'not-step-free'],
  ['accessible-restroom', 'no-accessible-restroom'],
] as const

export type ContradictionPairs = ReadonlyArray<readonly [string, string]>

const NEGATIVES: ReadonlySet<string> = new Set(ACCESSIBILITY_CONTRADICTIONS.map(([, n]) => n))

/** True for the three negative assertions, false for everything else. */
export function isNegativeAccessibility(slug: string): boolean {
  return NEGATIVES.has(slug)
}

/** The slug this one cannot coexist with, in either direction. */
export function contradictionOf(
  slug: string,
  pairs: ContradictionPairs = ACCESSIBILITY_CONTRADICTIONS,
): string | undefined {
  for (const [pos, neg] of pairs) {
    if (slug === pos) return neg
    if (slug === neg) return pos
  }
  return undefined
}

export interface ContradictionResolution {
  /** Sorted, de-duplicated, contradiction-free. */
  resolved: string[]
  /** Values removed because their opposite was also asserted. */
  dropped: string[]
  /** The pairs that were in conflict, as declared: [positive, negative]. */
  conflicts: Array<[string, string]>
}

/**
 * Drop the losing half of every contradicting pair, keeping the NEGATIVE.
 *
 * Policy decision, 2026-08-30: when two sources disagree about access, publish
 * the negative. A traveller who is wrongly told a door is step-free arrives and
 * cannot get in; a traveller wrongly told it is not merely goes elsewhere. The
 * two errors are not symmetric.
 *
 * The conflict is never silently swallowed — callers surface `conflicts` as a
 * review row plus `needs_attention`, so the disagreement stays visible and a
 * human can settle it. Resolution is idempotent: its own output re-resolves to
 * itself with zero conflicts.
 */
export function resolveContradictions(
  values: Iterable<string>,
  pairs: ContradictionPairs = ACCESSIBILITY_CONTRADICTIONS,
): ContradictionResolution {
  const present = new Set<string>()
  for (const raw of values) {
    const v = String(raw ?? '').trim().toLowerCase()
    if (v) present.add(v)
  }

  const dropped: string[] = []
  const conflicts: Array<[string, string]> = []
  for (const [pos, neg] of pairs) {
    if (present.has(pos) && present.has(neg)) {
      present.delete(pos)
      dropped.push(pos)
      conflicts.push([pos, neg])
    }
  }

  return { resolved: [...present].sort(), dropped: dropped.sort(), conflicts }
}
