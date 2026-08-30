import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import {
  AIDS_CH_FEED_URL,
  AIDS_CH_SOURCE,
  payloadsFromFeed,
  type AidsChFeed,
  type HealthServicePayload,
} from '../_shared/aids-ch-parse.ts'

// ============================================================
// Source: aids.ch — the Swiss AIDS Federation's health-centre directory,
// i.e. the public face of the national sexual-health registry
// repertoire-sante-sexuelle.ch. 201 counselling, testing and treatment centres.
//
// TARGET IS `organizations`, NOT `ingestion_staging`, and that is a decision
// this function inherits rather than makes. `20260916160000` built the support-
// org testing layer for exactly this shape and its header says why: "a testing
// site IS a place, and minting 534 `venues` rows to hold the coordinates would
// put clinics into venue browse and onto the map beside bars and saunas." So
// there is no adapter, no staging row and no DAG here — one fetch, then
// `commit_health_service_org` per record, which owns the adopt-before-create
// ladder and the city-resolution guard.
//
// ONE REQUEST FOR THE WHOLE CORPUS. The directory ships as a single JSON
// document (see _shared/aids-ch-parse.ts for how it was found and why the
// rendered page is useless). That is what makes this cron-able where
// testfinder — 46 country pages at a 5s politeness delay — has to be a script.
//
// EVERY ROW LANDS AS status='draft'. Same bar as the testfinder import: a
// health facility is published only once something has re-checked it, and
// checking means touching ~190 third-party hosts, which belongs in
// `scripts/data-quality/import-aids-ch.mjs --phase verify`, not in an edge
// function with a wall-clock budget. A re-sync never writes `status`, so this
// running weekly cannot unpublish what a human or that script promoted.
//
// CONCURRENCY IS 6 AND THE CAP IS THE POINT. 201 sequential PostgREST round
// trips is ~15s of the invocation budget spent waiting; unbounded parallelism
// instead stacks 201 advisory-lock-taking transactions against a disk-
// constrained instance. Six is enough to make the wall clock irrelevant and
// small enough to stay invisible to everything else on the box.
//
// A ROW THAT FAILS DOES NOT TAKE THE BATCH DOWN. Failures are counted and the
// first few are returned in the response, because "141 of 201 committed" plus
// the reason is actionable and a 500 with one Postgres message is not.
// ============================================================

const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'
const CONCURRENCY = 6

async function fetchFeed(url: string): Promise<AidsChFeed> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`aids-ch feed ${res.status}`)
  const feed = (await res.json()) as AidsChFeed
  if (!Array.isArray(feed?.data)) {
    throw new Error('aids-ch feed has no `data` array — refusing to treat that as an empty directory')
  }
  return feed
}

interface CommitTally {
  committed: number
  failed: number
  errors: Array<{ external_id: string; name: string; error: string }>
}

/** Run `commit_health_service_org` over the batch, bounded and fault-isolated. */
async function commitAll(
  supabase: ReturnType<typeof getServiceClient>,
  payloads: HealthServicePayload[],
): Promise<CommitTally> {
  const tally: CommitTally = { committed: 0, failed: 0, errors: [] }
  let cursor = 0

  async function worker() {
    while (cursor < payloads.length) {
      const p = payloads[cursor++]
      const { error } = await supabase.rpc('commit_health_service_org', { p })
      if (error) {
        tally.failed++
        if (tally.errors.length < 10) {
          tally.errors.push({ external_id: p.external_id, name: p.name, error: error.message })
        }
      } else {
        tally.committed++
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, payloads.length) }, worker))
  return tally
}

Deno.serve(
  withErrorReporting('source-aids-ch', async (req) => {
    if (req.method === 'OPTIONS') return corsResponse(req)
    const _auth = await requireInternalOrAdmin(req, getServiceClient())
    if (_auth instanceof Response) return _auth

    const supabase = getServiceClient()
    try {
      const body = await req.json().catch(() => ({}))
      const dryRun: boolean = body.dry_run ?? body.dryRun ?? false
      // A limit exists for probing, not for pagination: the feed has no pager
      // and always returns the whole directory, so a limit below 201 silently
      // stops re-syncing the tail. Default is "everything".
      const limit: number | null = body.limit ?? body.batch_size ?? null

      const fetchedAt = new Date().toISOString()
      const feed = await fetchFeed(String(body.feed_url ?? AIDS_CH_FEED_URL))
      const { payloads: all, skipped } = payloadsFromFeed(feed, fetchedAt)
      const payloads = limit ? all.slice(0, Number(limit)) : all

      if (dryRun) {
        return jsonResponse(
          {
            success: true,
            dry_run: true,
            source: AIDS_CH_SOURCE,
            items: payloads.length,
            items_total: feed.data.length,
            skipped,
            sample: payloads.slice(0, 3),
          },
          200,
          req,
        )
      }

      const tally = await commitAll(supabase, payloads)

      return jsonResponse(
        {
          success: true,
          source: AIDS_CH_SOURCE,
          fetched_at: fetchedAt,
          items: tally.committed,
          items_total: feed.data.length,
          items_processed: payloads.length,
          items_succeeded: tally.committed,
          items_failed: tally.failed + skipped.length,
          // Records the feed itself could not yield a payload for (no name in
          // any of its four languages), kept distinct from commit failures.
          unparseable: skipped,
          errors: tally.errors,
        },
        200,
        req,
      )
    } catch (error) {
      return errorResponse((error as Error).message, 500, req)
    }
  }),
)
