import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { parsePage, type QdEvent, type QdKind, type QdSkips } from '../_shared/queerde-parse.ts'

// ============================================================
// Source: queer.de — the German-language CSD / Pride calendars
//
//   /csd-termine.php              22 live + 448 archive
//   /gay-pride-international.php   3 live +  25 archive
//
// queer.de is Germany's main queer news outlet and this list is THE reference
// for CSD dates — hand-maintained, which is why it carries the small-town
// prides no ticketing platform lists (Bramsche, Freital, Prenzlau, Kulmbach).
// The platform had no queer.de source at all before this.
//
// Both pages publish hCalendar microformat, so the parser reads structure, not
// rendered text. All the parsing traps — and the fact that the pages are
// undeclared ISO-8859-1 — live in `_shared/queerde-parse.ts`, which is pure and
// unit-tested; this file only fetches, shapes and stages.
//
// ── WHY THE ARCHIVE IS OPT-IN ────────────────────────────────
// 473 of the 498 rows are past events. They are legitimate for this corpus
// (`events` deliberately holds ~36.5k past events from the Wayback import, so a
// past date is not a defect here), but re-reading them on every weekly run is
// pointless once they are in. `include_past` defaults FALSE: the cron re-reads
// only the live section, and the archive is a deliberate one-time run.
//
// ── EVERY ROW LANDS IN REVIEW, AND THAT IS CORRECT ───────────
// queer.de publishes no description, no image and no coordinates, so each row
// trips W_DESCRIPTION_MISSING_OR_THIN + W_IMAGE_MISSING + W_DESCRIPTION_THIN +
// W_NO_GEO — over `warn_review_threshold` (3), so `pipeline-validate` writes
// `ai_validation_status='needs_review'` and `ai_confidence_score=0.5`.
//
// That is thin metadata, not doubtful correctness, and it is NOT worked around
// here: no description is invented, no city centroid is stamped as if it were
// the event's own coordinate, and the threshold is not raised. A human confirms
// once and `trg_staging_human_approval_clears_validation` promotes the row.
//
// Two operational consequences the operator must know, both measured:
//   • 0.5 confidence is BELOW `triage_bulk_approve_high_conf`'s 0.9 default, so
//     the "Approve ≥90%" button can never see these rows.
//   • `staging_auto_reject_stale` (cron 45 3 * * *) auto-rejects any
//     `pending_review` + `pending` row older than 30 DAYS. An un-reviewed
//     archive import is silently thrown away after a month.
//
// ── NO GEO RESOLUTION HERE ───────────────────────────────────
// City / region / country are staged as TEXT. `cities.region_name` is in English
// ("Lower Saxony") while this source gives German ("Niedersachsen"), so the
// region cannot corroborate a city match without a mapping; and `Berlin` and
// `Potsdam` both have US namesakes, so resolving by name alone is the documented
// namesake defect. The guarded nightly runners do it instead —
// `run_event_city_link` blocks rather than guessing when its signals disagree.
// ============================================================

const PAGES: ReadonlyArray<{ kind: QdKind; url: string }> = [
  { kind: 'de', url: 'https://www.queer.de/csd-termine.php' },
  { kind: 'intl', url: 'https://www.queer.de/gay-pride-international.php' },
]

const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

/** See source-display-magazin for why `location` is widened separately. */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

/**
 * Raw BYTES, not text. The pages declare no charset and are ISO-8859-1, and
 * `parsePage` owns the decoding so a caller cannot accidentally hand it a
 * UTF-8-decoded string with every umlaut already destroyed.
 */
async function getBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (!res.ok) throw new Error(`queer.de ${res.status} for ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** `kind` and the page url ride along so normalize() can stamp provenance without re-deriving them. */
type QdRaw = QdEvent & { kind: QdKind; pageUrl: string }

/**
 * Read both pages and return the rows plus the skip tally.
 *
 * Separate from `adapter.fetch` because the skip counts have to reach the
 * response — a dropped row is a stated decision, not a silence — and
 * `SourceAdapter.fetch` can only return items. Stashing them on the config
 * object instead would make a shared input mutable across a concurrent
 * invocation for no benefit.
 */
async function collect(batchSize: number, includePast: boolean): Promise<{ items: RawItem[]; skips: QdSkips; pagesFailed: string[] }> {
  const items: RawItem[] = []
  const skips: QdSkips = { cancelled: 0, noCity: 0, unknownRegion: 0, incomplete: 0 }
  const pagesFailed: string[] = []

  for (const page of PAGES) {
    try {
      const parsed = parsePage(await getBytes(page.url), page.kind, page.url)
      for (const k of Object.keys(skips) as (keyof QdSkips)[]) skips[k] += parsed.skipped[k]
      for (const e of parsed.events) {
        if (e.past && !includePast) continue
        items.push({
          sourceId: e.sourceId,
          data: { ...e, kind: page.kind, pageUrl: page.url } as unknown as Record<string, unknown>,
        })
      }
    } catch (err) {
      // One unreachable page must not lose the other: a run that staged the
      // German calendar and failed on the international one is still useful.
      // Named on the response so a half-run is never mistaken for a full one.
      pagesFailed.push(page.url)
      console.warn(`source-queerde ${page.url}: ${(err as Error).message}`)
    }
  }

  return { items: items.slice(0, batchSize), skips, pagesFailed }
}

const eventAdapter: SourceAdapter = {
  name: 'queerde',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const { items } = await collect(config.batchSize, config.filters?.includePast === true)
    return items
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as QdRaw
    const item: StagedItem = {
      entityType: 'event',
      sourceId: e.sourceId,
      sourceName: 'queerde',
      name: e.title,
      title: e.title,
      // queer.de publishes no description. Leaving it empty costs two warnings
      // and a trip through review; composing one from the other fields would be
      // padding dressed as content, which is worse.
      event_type: e.eventType,
      start_date: e.start,
      end_date: e.end,
      dates: { start: e.start, end: e.end ?? undefined },
      // Null when queer.de named no venue or named the "Diverse" placeholder.
      venue_name: e.venueName ?? undefined,
      website: e.websites[0],
      location: {
        city: e.city,
        // Bundesland on the German page, absent on the international one.
        state: e.region ?? undefined,
        // Sent beside `city` on purpose: commit resolves country first and scopes
        // the city lookup by it, so omitting it invites a same-name collision.
        country: e.countryCode,
      },
      tags: ['lgbtq'],
      urls: e.websites,
      metadata: {
        source: 'queerde',
        url: e.pageUrl,
        queerde_event_id: e.eventId,
        queerde_page: e.kind,
        // The archive divider this row fell on, kept so a past import is
        // distinguishable from a live one after the fact.
        queerde_archive: e.past,
      },
    }
    return item
  },
}

Deno.serve(withErrorReporting('source-queerde', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const includePast = body.include_past ?? body.includePast ?? false
    const config: AdapterConfig = {
      // The live sections total 25 rows; the archive adds 460. Default is roomy
      // enough for the whole live set so a run is complete rather than
      // perpetually re-reading the head, and large enough for the archive when
      // it is asked for.
      batchSize: body.limit ?? body.batch_size ?? (includePast ? 600 : 80),
      dryRun: body.dry_run ?? body.dryRun ?? false,
      filters: { includePast },
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const { items: rawEvents, skips, pagesFailed } = await collect(config.batchSize, includePast)
    const live = rawEvents.filter((r) => !(r.data as unknown as QdRaw).past).length

    if (config.dryRun) {
      return jsonResponse({
        success: true,
        items: rawEvents.length,
        live,
        archive: rawEvents.length - live,
        include_past: includePast,
        skipped: skips,
        pages_failed: pagesFailed,
        dry_run: true,
        sample: rawEvents.slice(0, 3).map((r) => eventAdapter.normalize(r)),
      }, 200, req)
    }

    const written = await writeToStaging(supabase, eventAdapter, rawEvents, {
      ...config,
      targetTable: 'events',
    })

    return jsonResponse({
      success: true,
      items: written,
      items_total: rawEvents.length,
      items_processed: written,
      items_succeeded: written,
      items_failed: 0,
      live,
      archive: rawEvents.length - live,
      include_past: includePast,
      // Already-seen rows are skipped by the (source_name, source_entity_id)
      // idempotency index, so `written` < `items_total` on a repeat run is
      // expected rather than a fault.
      already_staged: rawEvents.length - written,
      skipped: skips,
      pages_failed: pagesFailed,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
