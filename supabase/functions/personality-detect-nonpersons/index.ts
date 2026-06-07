// Follow-on to the personalities content-quality remediation
// (docs/plans/2026-06-07-personalities-content-quality-design.md).
//
// A CSV upload (issue #113) routed ~10k mixed rows into personalities — real
// people but also venues, events, glossary terms, postcodes. The bio-extractor
// surfaced many in the Wikidata-absent residue ("The Sisters of Perpetual
// Indulgence", "La Montaña" restaurant, "SF Tsunami Water Polo"). The Wikidata
// resolver's P31=Q5 filter already refuses them, so they sit unmatchable.
//
// This scans the UNANCHORED, non-archived residue (anchored rows score
// person +4 for the QID/birth_date, so a real person can't be flagged) and runs
// the shared pure-logic classifier. Hybrid-by-confidence, matching the platform's
// other truth loops:
//   - confident non-person (>= 0.60): soft-archive (reversible) with a distinct
//     reason marker, so it leaves the personalities surface but is recoverable.
//   - ambiguous (0.45-0.60): flag needs_attention + record the detected kind for
//     a human to decide; never auto-archived.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body:
//   { batch_size?, dry_run?, archive_threshold? }

import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { classifyEntity, isEntityTypeMismatch } from '../_shared/entity-classifier.ts'

type Row = Record<string, unknown>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  const secret = req.headers.get('x-webhook-secret')
  const expected = Deno.env.get('WEBHOOK_SECRET') || 'meilisearch-sync-webhook-2026'
  if (secret !== expected) return errorResponse('Unauthorized', 401, req)

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(500, body.batch_size ?? 200)
    const archiveThreshold = typeof body.archive_threshold === 'number' ? body.archive_threshold : 0.6
    const dryRun = body.dry_run === true
    const idGt = (body.id_gt as string | undefined) ?? '00000000-0000-0000-0000-000000000000'

    // Unanchored, non-archived residue only. Ordered by id with an id_gt cursor so
    // repeated calls make progress (most rows are real thin people we don't mark,
    // so without a cursor they would reappear every batch).
    const { data: rows, error } = await supabase
      .from('personalities')
      .select('id, name, bio, description, birth_date, death_date, wikidata_qid, profession, pronouns, enrichment_status, review_status, visibility')
      .is('wikidata_qid', null)
      .is('duplicate_of_id', null)
      .neq('review_status', 'archived')
      .gt('id', idGt)
      .order('id', { ascending: true })
      .limit(batchSize)
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!rows?.length) return jsonResponse({ success: true, scanned: 0, done: true, message: 'done' }, 200, req)

    let scanned = 0, archived = 0, flagged = 0, failed = 0
    let lastId = idGt
    const samples: Row[] = []

    for (const r of rows as Row[]) {
      scanned++
      lastId = r.id as string
      const es = (r.enrichment_status as Record<string, unknown> | null) ?? {}
      if (es.entity_kind) continue // already classified

      const result = classifyEntity({
        name: r.name as string,
        bio: r.bio as string | null,
        description: r.description as string | null,
        birth_date: r.birth_date as string | null,
        death_date: r.death_date as string | null,
        wikidata_qid: r.wikidata_qid as string | null,
        profession: r.profession as string | null,
        pronouns: r.pronouns as string | null,
      })
      if (!isEntityTypeMismatch(result, 'personalities', 0.45)) continue

      const willArchive = result.confidence >= archiveThreshold
      if (samples.length < 25) {
        samples.push({ id: r.id, name: r.name, kind: result.classified_as, confidence: Number(result.confidence.toFixed(2)), action: willArchive ? 'archive' : 'flag' })
      }
      if (dryRun) { if (willArchive) archived++; else flagged++; continue }

      const enrichment = {
        ...es,
        entity_kind: result.classified_as,
        entity_kind_confidence: Number(result.confidence.toFixed(2)),
        entity_kind_signals: result.signals.slice(0, 8),
        entity_kind_at: new Date().toISOString(),
      }

      const patch: Row = { enrichment_status: enrichment, updated_at: new Date().toISOString() }
      if (willArchive) {
        patch.review_status = 'archived'
        patch.seo_indexable = false
        patch.visibility = 'draft'
        patch.needs_attention = false
        ;(enrichment as Row).archived_reason = 'non_person'
      } else {
        patch.needs_attention = true
      }

      const { error: upErr } = await supabase.from('personalities').update(patch).eq('id', r.id)
      if (upErr) { failed++; continue }
      if (willArchive) archived++; else flagged++
    }

    return jsonResponse({ success: true, scanned, archived, flagged, failed, last_id: lastId, dry_run: dryRun, samples }, 200, req)
  } catch (error) {
    console.error('personality-detect-nonpersons:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
