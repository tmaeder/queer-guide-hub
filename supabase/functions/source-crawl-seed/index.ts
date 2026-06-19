import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import { extractContent } from '../_shared/extract-client.ts'

// ============================================================
// Source: Crawl Seed — discover pages from one seed URL.
//
// Given a seed URL, asks the extract worker for its same-origin links
// (crawl=true), then extracts each candidate page (cleaned markdown + title +
// metadata) and stages it as a raw row for the standard pipeline to normalize →
// extract (markdown refresh) → validate → enrich → dedup → commit.
//
// Config (node data.config or POST body):
//   seed_url        required — the page to discover links from
//   target_table    default 'news_articles'
//   entity_type     default 'news_article'
//   max_candidates  default 25 (hard cap 50)
//   path_prefix     optional — only keep candidate paths starting with this
//   render          optional — extract via Browser Rendering (Phase 4 / SPAs)
//
// Depth-1 only: the worker returns the seed's links; we do NOT recurse. Each
// candidate becomes its own staging row; recursion would be a follow-up seed.
// ============================================================

const SOURCE_TYPE = 'crawl-seed'
const HARD_CAP = 50

function host(u: string): string {
  try { return new URL(u).host } catch { return '' }
}

Deno.serve(withErrorReporting('source-crawl-seed', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const seedUrl       = String(body.seed_url ?? '').trim()
    const targetTable   = String(body.target_table ?? 'news_articles')
    const entityType    = String(body.entity_type ?? 'news_article')
    const maxCandidates = Math.min(HARD_CAP, Number(body.max_candidates ?? 25))
    const pathPrefix    = body.path_prefix ? String(body.path_prefix) : null
    const render        = body.render === true
    const dryRun        = body.dry_run === true
    const pipelineRunId = (body.pipeline_run_id as string | undefined) ?? null
    const nodeId        = (body.node_id as string | undefined) ?? null

    if (!/^https?:\/\//i.test(seedUrl)) {
      return errorResponse('seed_url required (http/https)', 400, req)
    }
    try { assertPublicHttpUrl(seedUrl) } catch (e) {
      return errorResponse(`seed_url blocked: ${(e as Error).message}`, 400, req)
    }

    // 1. Discover same-origin candidate links from the seed.
    const seedExtract = await extractContent(supabase, { url: seedUrl, crawl: true, render })
    if (!seedExtract) {
      // No result for the seed: worker down / circuit open, OR the seed page
      // failed to fetch (too large, blocked, non-HTML). Non-fatal skip so a DAG
      // run doesn't fail.
      return jsonResponse({ success: true, skipped: true, reason: 'seed extraction returned no result (worker unavailable, or seed too large/blocked)', seed: seedUrl, items: 0 }, 200, req)
    }

    const seedHost = host(seedUrl)
    const candidates = (seedExtract.links?.flat ?? [])
      .filter((u) => host(u) === seedHost)
      .filter((u) => {
        if (!pathPrefix) return true
        try { return new URL(u).pathname.startsWith(pathPrefix) } catch { return false }
      })
      .filter((u) => { try { assertPublicHttpUrl(u); return true } catch { return false } })
      .slice(0, maxCandidates)

    if (candidates.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'no candidates discovered', seed: seedUrl }, 200, req)
    }

    // 2. Extract each candidate page, build a raw staging row.
    const rows: Record<string, unknown>[] = []
    let extractFailed = 0
    for (const url of candidates) {
      const ext = await extractContent(supabase, { url, render })
      if (!ext || !ext.meta.title || ext.charCount < 120) { extractFailed++; continue }
      rows.push({
        source_type: SOURCE_TYPE,
        source_name: `crawl:${seedHost}`,
        source_entity_id: url,
        entity_type: entityType,
        target_table: targetTable,
        raw_data: {
          title: ext.meta.title,
          content: ext.markdown,
          description: ext.meta.description ?? '',
          url,
          image_url: ext.meta.image ?? null,
          published_at: ext.meta.publishedAt ?? null,
          source: seedHost,
          _crawl_seed: seedUrl,
        },
        pipeline_run_id: pipelineRunId,
        node_id: nodeId,
        job_id: pipelineRunId ?? '00000000-0000-0000-0000-000000000000',
      })
    }

    if (dryRun) {
      return jsonResponse({
        success: true, dry_run: true, seed: seedUrl,
        candidates: candidates.length, staged: rows.length, extract_failed: extractFailed,
      }, 200, req)
    }

    // 3. Insert (skip duplicates via idempotency_key index — 23505 fallback).
    let inserted = 0
    if (rows.length > 0) {
      const isDup = (e: { code?: string; message?: string }) =>
        e.code === '23505' || !!e.message?.includes('duplicate key')
      const { error: bulkErr } = await supabase.from('ingestion_staging').insert(rows)
      if (!bulkErr) {
        inserted = rows.length
      } else if (isDup(bulkErr)) {
        for (const row of rows) {
          const { error: rowErr } = await supabase.from('ingestion_staging').insert(row)
          if (!rowErr) inserted++
          else if (!isDup(rowErr)) console.warn(`crawl-seed insert: ${rowErr.message}`)
        }
      } else {
        return errorResponse(`staging write failed: ${bulkErr.message}`, 500, req)
      }
    }

    return jsonResponse({
      success: true,
      seed: seedUrl,
      candidates: candidates.length,
      items: inserted,
      items_total: candidates.length,
      items_succeeded: inserted,
      items_failed: extractFailed,
      extract_failed: extractFailed,
    }, 200, req)
  } catch (error) {
    console.error('source-crawl-seed:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
