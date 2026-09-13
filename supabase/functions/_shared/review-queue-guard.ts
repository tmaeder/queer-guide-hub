import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

// One place that answers "may I queue this proposal?" for every review-queue writer.
//
// It replaces the per-function `alreadyQueued` Sets and adds the half none of them had:
// a proposal that was already REJECTED is not re-offered. `uq_erq_open` is a PARTIAL
// unique index covering `status='open'` ONLY, so a rejected row never blocks a fresh
// insert — which is how the marketplace queue became a machine-to-machine treadmill
// (measured 2026-09-13: 126 listings rejected more than once, max 3 rounds, one over six
// days; the producer proposes, auto-triage rejects ~3h later, the producer proposes the
// same thing again).
//
// REJECTED ONLY, deliberately. An APPROVED proposal is applied to the entity, so the
// producer's next run usually sees the new state and stops on its own; blocking it would
// also stop a legitimate re-application if someone later edits that value back out. A
// rejection is the case where nothing about the entity changes, so identical evidence
// regenerates an identical proposal forever.

export type BlockReason = 'open' | 'rejected'

export interface ReviewQueueGuard {
  /** null = free to queue. */
  blocked(entityId: string, field: string, proposedValue: unknown): BlockReason | null
  /** Record a successful insert so a second proposal in the SAME run cannot double-insert. */
  markQueued(entityId: string, field: string): void
  /** True when either read failed. The caller must report it: a failed read is not evidence. */
  readonly precheckFailed: boolean
}

export interface ReviewQueueGuardOptions {
  /** Compat view to read, e.g. 'venue_review_queue'. */
  view: string
  /** Its entity-id column, e.g. 'venue_id'. */
  idColumn: string
  /** The fields this writer gates — scopes the read; other writers' fields are not ours. */
  fields: readonly string[]
  /** Entity ids in this run. */
  ids: string[]
}

/**
 * Stable JSON — keys sorted recursively.
 *
 * LOAD-BEARING, and the reason is not obvious: jsonb does NOT preserve key insertion
 * order. It stores keys sorted by length then bytewise, so a proposal written as
 * `{subcategory, from_rating, to_rank, rationale}` reads back as
 * `{to_rank, rationale, from_rating, subcategory}`. A plain `JSON.stringify` comparison
 * would therefore NEVER match a stored row, and this guard would silently block nothing
 * while every structural test of it still passed.
 *
 * Array order is preserved, because for an array the order is part of the value.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src).sort()) out[k] = sortKeys(src[k])
    return out
  }
  return value
}

const key = (entityId: string, field: string) => `${entityId}:${field}`

/**
 * Read the open and already-rejected proposals for this run, ONCE.
 *
 * Each map is NULL rather than empty when its read fails, so `?.` is falsy and the guard
 * declines to answer instead of answering "nothing is queued" — a failed read must never
 * be indistinguishable from an empty queue. The consequences differ per map and that is
 * worth knowing: an unread OPEN map degrades safely, because `uq_erq_open` still refuses
 * the duplicate insert (23505); an unread REJECTED map has no database backstop at all,
 * so the run may re-propose. Both are reported through `precheckFailed`.
 */
export async function loadReviewQueueGuard(
  supabase: SupabaseClient,
  opts: ReviewQueueGuardOptions,
): Promise<ReviewQueueGuard> {
  let openKeys: Set<string> | null = new Set()
  let rejectedValues: Map<string, Set<string>> | null = new Map()
  let precheckFailed = false

  if (opts.ids.length) {
    const fields = [...opts.fields]

    const { data: openRows, error: openErr } = await supabase
      .from(opts.view)
      .select(`${opts.idColumn}, field`)
      .eq('status', 'open')
      .in('field', fields)
      .in(opts.idColumn, opts.ids)
    if (openErr) {
      openKeys = null
      precheckFailed = true
      console.warn(`[review-queue-guard] open read failed on ${opts.view}: ${openErr.message}`)
    } else {
      // The select list is built from `opts.idColumn`, so supabase-js cannot parse it at
      // the type level and infers a ParserError. The runtime shape is plain rows.
      const rows = (openRows ?? []) as unknown as Record<string, unknown>[]
      openKeys = new Set(rows.map((r) => key(String(r[opts.idColumn]), String(r.field))))
    }

    const { data: rejRows, error: rejErr } = await supabase
      .from(opts.view)
      .select(`${opts.idColumn}, field, proposed_value`)
      .eq('status', 'rejected')
      .in('field', fields)
      .in(opts.idColumn, opts.ids)
    if (rejErr) {
      rejectedValues = null
      precheckFailed = true
      console.warn(`[review-queue-guard] rejected read failed on ${opts.view}: ${rejErr.message}`)
    } else {
      const m = new Map<string, Set<string>>()
      for (const row of (rejRows ?? []) as unknown as Record<string, unknown>[]) {
        const k = key(String(row[opts.idColumn]), String(row.field))
        let s = m.get(k)
        if (!s) { s = new Set(); m.set(k, s) }
        s.add(canonicalJson(row.proposed_value))
      }
      rejectedValues = m
    }
  }

  return {
    get precheckFailed() { return precheckFailed },
    blocked(entityId, field, proposedValue) {
      const k = key(entityId, field)
      if (openKeys?.has(k)) return 'open'
      // Value equality, not merely "this field was rejected once". Measured across every
      // repeat rejection on record (126 groups, 273 rows): ALL 126 re-proposed a
      // byte-identical value and NONE differed, so this suppresses pure repeats and
      // leaves a genuinely changed proposal free to reach a human.
      if (rejectedValues?.get(k)?.has(canonicalJson(proposedValue))) return 'rejected'
      return null
    },
    markQueued(entityId, field) {
      openKeys?.add(key(entityId, field))
    },
  }
}
