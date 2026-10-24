import { decodeBytes } from '../_shared/decode-charset.ts'
import { repairReplacementChars, sourceTextFromMarkup } from '../_shared/repair-replacement-chars.ts'
import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { extractArticle } from '../_shared/news-quality/extract.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// News Full-Text Backfill — re-fetch the source URL for THIN, already-committed
// news_articles and swap in the recovered body. Counterpart to
// pipeline-extract-fulltext (which only runs pre-commit, in staging).
//
// Conservative: only swaps when the fetch yields materially MORE text than the
// committed stub. Idempotent: enrichment_status.refetch marks every processed
// row (applied true/false) so a row is never re-fetched. A successful swap bumps
// updated_at (nightly quality/trust recompute re-scores it) and clears the geo
// "checked" marker so geo-link re-evaluates the fuller text.

const FETCH_TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 3_000_000
const MIN_GAIN_RATIO = 1.2
const MIN_SWAP_LEN = 400   // absolute floor: don't swap unless recovered body is a real article
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide/bot)'

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml/i.test(ct)) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_HTML_BYTES) return null
    // Honour the declared charset — a forced UTF-8 decode turns Latin-1
    // pages (queer.de) into U+FFFD, irreversibly.
    return decodeBytes(new Uint8Array(buf), ct).text
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

type Row = { id: string; url: string; content_len: number }

type BrokenRow = { id: string; url: string; title: string; excerpt: string | null; content: string | null }

const FFFD = '\uFFFD'
const REPAIR_FIELDS = ['title', 'excerpt', 'content'] as const

// mode='repair_encoding': rows ingested while a fetcher forced UTF-8 onto a
// Latin-1 feed carry U+FFFD where every umlaut was. The stored text cannot be
// fixed from itself, so the publisher's page is re-fetched (now decoded with
// its declared charset) and each replacement run is restored from its
// surrounding context. Only fields that change are written; a run whose
// context is missing or ambiguous is left as-is and counted.
async function repairEncoding(
  supabase: ReturnType<typeof getServiceClient>,
  body: Record<string, unknown>,
  req: Request,
): Promise<Response> {
  const limit = Math.min(60, Number(body.batch_size) || 30)
  const dryRun = body.dry_run === true
  const { data, error } = await supabase
    .from('news_articles')
    .select('id, url, title, excerpt, content')
    .or(`title.like.*${FFFD}*,excerpt.like.*${FFFD}*,content.like.*${FFFD}*`)
    .not('url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return errorResponse(`load: ${error.message}`, 500, req)
  const rows = (data ?? []) as BrokenRow[]

  let rowsFixed = 0, rowsPartial = 0, fetchFailed = 0, charsRepaired = 0, charsRemaining = 0
  const unresolved: string[] = []
  for (const row of rows) {
    const html = await fetchHtml(row.url)
    if (!html) { fetchFailed++; unresolved.push(row.id); continue }
    const source = sourceTextFromMarkup(html)
    const patch: Record<string, string> = {}
    let left = 0
    for (const f of REPAIR_FIELDS) {
      const v = row[f]
      if (!v || !v.includes(FFFD)) continue
      const r = repairReplacementChars(v, source)
      charsRepaired += r.repaired
      charsRemaining += r.remaining
      left += r.remaining
      if (r.repaired > 0) patch[f] = r.text
    }
    if (left > 0) { rowsPartial++; unresolved.push(row.id) }
    if (Object.keys(patch).length === 0) continue
    rowsFixed++
    if (dryRun) continue
    const { error: upErr } = await supabase.from('news_articles').update(patch).eq('id', row.id)
    if (upErr) { console.error(`repair ${row.id}: ${upErr.message}`); rowsFixed-- }
  }
  return jsonResponse({
    success: true, mode: 'repair_encoding', dry_run: dryRun,
    rows: rows.length, rows_fixed: rowsFixed, rows_partial: rowsPartial, fetch_failed: fetchFailed,
    chars_repaired: charsRepaired, chars_remaining: charsRemaining,
    unresolved: unresolved.slice(0, 50),
  }, 200, req)
}

Deno.serve(withErrorReporting('news-fulltext-backfill', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    if (body.mode === 'repair_encoding') return await repairEncoding(supabase, body, req)
    const batchSize   = Math.min(60, body.batch_size ?? 30)
    const concurrency = Math.min(6, Math.max(1, body.concurrency ?? 4))
    const dryRun      = body.dry_run === true

    const { data: rows, error } = await supabase.rpc('news_thin_for_refetch', { p_limit: batchSize })
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    const items = (rows ?? []) as Row[]
    if (items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to refetch' }, 200, req)
    }

    let improved = 0, unchanged = 0, failed = 0

    const worker = async (item: Row) => {
      try {
        const html = await fetchHtml(item.url)
        const art = html ? extractArticle(html, item.url) : null
        const meta = {
          method: art?.method ?? 'fetch_failed',
          original_length: item.content_len,
          extracted_length: art?.charCount ?? 0,
        }
        const swap =
          !!art && !!art.content &&
          art.content.length >= MIN_SWAP_LEN &&
          art.content.length > item.content_len * MIN_GAIN_RATIO

        if (dryRun) { if (swap) improved++; else unchanged++; return }

        const { error: rpcErr } = await supabase.rpc('apply_news_refetch', {
          p_id: item.id,
          p_content: swap ? art!.content : null,
          p_meta: meta,
        })
        if (rpcErr) { failed++; console.error(`apply ${item.id}: ${rpcErr.message}`); return }
        if (swap) improved++; else unchanged++
      } catch (e) {
        failed++
        console.error(`refetch ${item.id}: ${(e as Error).message}`)
      }
    }

    // Bounded concurrency pool.
    let cursor = 0
    const runners = Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const idx = cursor++
        await worker(items[idx])
      }
    })
    await Promise.all(runners)

    return jsonResponse({
      success: true,
      items: items.length,
      improved, unchanged, failed,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('news-fulltext-backfill:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
