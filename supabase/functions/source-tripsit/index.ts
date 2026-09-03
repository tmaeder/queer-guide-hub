import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import {
  TRIPSIT_CIRCUIT,
  TRIPSIT_COMBOS_URL,
  TRIPSIT_SOURCE,
  pairsFromCombos,
} from '../_shared/tripsit-combos.ts'

// ============================================================
// Source: TripSit — the pairwise drug-interaction matrix behind
// https://combo.tripsit.me/, published machine-readably as combos.json in
// github.com/TripSit/drugs.
//
// WHY THIS EXISTS. `public.substance_interactions` was loaded once by
// `20260909172500` and nothing ever refreshed it: no cron, no registry row, no
// sentinel. Measured 2026-08-30, the 421 TripSit rows still read
// `fetched_at = 2026-08-15`. On a page that answers "can I combine these two?"
// a rating nobody has re-checked in months is a claim we are making on our own
// authority while attributing it to someone else.
//
// TARGET IS `substance_interactions`, NOT `ingestion_staging`, so there is no
// SourceAdapter here — same shape as `source-aids-ch`, and for the same reason.
// The adapter contract in `_shared/source-adapter.ts` exists to feed the
// normalize → validate → dedupe → commit DAG, and every stage of that DAG keys
// on a single entity with a name and a location. An interaction is a property
// of an unordered PAIR of tags; there is no `commit_substance_interactions_
// staging_batch`, no pipeline node and no target_table for it. Staging these
// rows would not merely be indirect — nothing would ever commit them, so 421
// rows would sit in `ingestion_staging` forever and surface as starvation in
// `pipeline_hygiene_stats().stale_pending_by_entity`. One fetch, then one
// transactional RPC that owns every guard, is the honest shape.
//
// THE TABLE IS MULTI-SOURCE AND A REFRESH MUST NOT TOUCH THE OTHER TWO. It also
// holds 48 eve&rave Substanzhandbuch rows and 7 FDA-label rows. Scoping is not
// a WHERE clause in this function — it is enforced inside
// `sync_tripsit_interactions`, because the interesting collision is subtle:
// `substance_interactions_pair_uniq` is unique across ALL sources, so if
// TripSit ever starts publishing a pair eve&rave already holds, a plain upsert
// would silently overwrite eve&rave's row with TripSit's rating and its
// attribution. The RPC skips such a pair and reports it instead.
//
// AN EMPTY OR TRUNCATED 200 IS NOT AN ANSWER. The RPC refuses the whole
// transaction — deletions included — if the feed yields implausibly few pairs.
// A partial fetch must never be read as upstream retracting warnings.
// ============================================================

const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

async function fetchCombos(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`tripsit combos.json ${res.status}`)
  return await res.json()
}

Deno.serve(
  withErrorReporting('source-tripsit', async (req) => {
    if (req.method === 'OPTIONS') return corsResponse(req)
    const _auth = await requireInternalOrAdmin(req, getServiceClient())
    if (_auth instanceof Response) return _auth

    const supabase = getServiceClient()
    try {
      const body = await req.json().catch(() => ({}))
      const dryRun: boolean = body.dry_run ?? body.dryRun ?? false
      const url = String(body.feed_url ?? TRIPSIT_COMBOS_URL)

      const fetchedAt = new Date().toISOString()
      // The breaker guards the third-party fetch only. A RAISE out of the RPC
      // below is our own refusal to write, not an upstream outage, and must not
      // count against a circuit whose whole job is to stop hammering GitHub.
      const raw = await withCircuitBreaker(supabase, TRIPSIT_CIRCUIT, () => fetchCombos(url))
      const parsed = pairsFromCombos(raw)

      const diagnostics = {
        substances: parsed.substances,
        directed_entries: parsed.directed,
        pairs_parsed: parsed.pairs.length,
        // A new upstream substance is reported, never resolved by name — two
        // upstream keys have slug twins that exist and are dead
        // (`amphetamines` merged, `mushrooms` deprecated), and a row filed
        // against either renders nowhere. See _shared/tripsit-combos.ts.
        unmapped_keys: parsed.unmappedKeys,
        // An unrecognised severity label leaves the stored row untouched rather
        // than downgrading it to `unknown`.
        unmapped_statuses: parsed.unmappedStatuses,
        // Upstream contradicting itself across the two directions of one pair.
        // Zero at import and zero when re-measured; the worse rating is kept.
        disagreements: parsed.disagreements,
      }

      if (dryRun) {
        return jsonResponse(
          { success: true, dry_run: true, source: TRIPSIT_SOURCE, ...diagnostics, sample: parsed.pairs.slice(0, 3) },
          200,
          req,
        )
      }

      const { data: tally, error } = await supabase.rpc('sync_tripsit_interactions', {
        p_rows: parsed.pairs,
        p_fetched_at: fetchedAt,
      })
      if (error) throw new Error(`sync_tripsit_interactions: ${error.message}`)

      const t = (tally ?? {}) as Record<string, unknown>
      return jsonResponse(
        {
          success: true,
          source: TRIPSIT_SOURCE,
          fetched_at: fetchedAt,
          // `items` is the count every other source-* function reports as work
          // done: pairs whose provenance stamp was refreshed this run.
          items: Number(t.stamped ?? 0),
          items_total: parsed.pairs.length,
          items_processed: parsed.pairs.length,
          items_succeeded: Number(t.stamped ?? 0) + Number(t.inserted ?? 0),
          items_failed: parsed.unmappedKeys.length + parsed.unmappedStatuses.length,
          ...diagnostics,
          ...t,
        },
        200,
        req,
      )
    } catch (error) {
      return errorResponse((error as Error).message, 500, req)
    }
  }),
)
