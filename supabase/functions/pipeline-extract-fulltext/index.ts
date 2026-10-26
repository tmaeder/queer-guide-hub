import { decodeBytes } from '../_shared/decode-charset.ts'
import { personAuthorCandidate } from '../_shared/news-author.ts'
import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { extractArticle } from '../_shared/news-quality/extract.ts'
import { extractContent } from '../_shared/extract-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { fetchRecoveryHtml, recoveryPageTitle, recoverySource, sourceRecoveryProposal } from './source-recovery.ts'

// Pipeline Extract Full-Text — fetch the source URL and recover the full body +
// metadata + cleaned markdown that RSS truncates. Runs AFTER pipeline-normalize
// and BEFORE pipeline-sanitize-news, so every downstream stage (sanitize, AI
// enrich, quality-enhance, validate, score) reasons over full text instead of stubs.
//
// Primary path: the self-hosted deepcrawl extract worker → cleaned markdown +
// plain-text body + metadata. Fallback (worker down / circuit open): the local
// readability-lite extractArticle(). The markdown is stashed in
// normalized_data.markdown for the enrich stage's LLM prompt.
//
// Idempotent: skips rows that already carry normalized_data.extraction_meta.
// Conservative: only replaces content when extraction yields materially MORE
// text than the RSS payload; never blanks an article on failure.
//
// Defaults to news_articles for back-compat; target_table is overridable via the
// node config so the same node can serve venue/event/place DAGs (Phase 2).

const FETCH_TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 3_000_000
const MIN_GAIN_RATIO = 1.2   // require extracted ≥ 1.2× the RSS length to swap
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide/bot)'

// Strip markdown syntax to a plain-text body for the content swap + gain check.
// Downstream sanitize/validate operate on plain text; markdown is kept separately.
function markdownToText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')        // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')      // links → text
    .replace(/^#{1,6}\s+/gm, '')                  // headings
    .replace(/[*_`>]/g, '')                       // emphasis / quote / code marks
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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

Deno.serve(withErrorReporting('pipeline-extract-fulltext', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const repairTruncated = body.repair_truncated === true
    const batchSize     = Math.min(repairTruncated ? 4 : 50, body.batch_size ?? (repairTruncated ? 4 : 15))
    const dryRun        = body.dry_run === true
    const targetTable   = (body.target_table as string | undefined) ?? 'news_articles'
    if (repairTruncated && targetTable !== 'news_articles') return errorResponse('Source recovery is news-only',400,req)

    type Item = { id:string; normalized_data:unknown; lease_token?:string }
    let items:Item[]
    if (repairTruncated) {
      const {data,error}=await supabase.rpc('claim_review_news_source_recovery',{p_batch:batchSize,p_dry_run:dryRun})
      if(error)return errorResponse(`claim: ${error.message}`,500,req)
      items=(data??[])as Item[]
    } else {
      let q = supabase
      .from('ingestion_staging')
      .select('id, normalized_data')
      .eq('target_table', targetTable)
      .eq('enrichment_status', 'pending')
      .not('normalized_data', 'is', null)
      .order('created_at', { ascending: true })
      .limit(batchSize)
    if (pipelineRunId) q = q.eq('pipeline_run_id', pipelineRunId)

      const { data, error } = await q
      if (error) return errorResponse(`load: ${error.message}`, 500, req)
      items=(data??[])as Item[]
    }
    if (items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to extract' }, 200, req)
    }

    let extracted = 0, skipped = 0, failed = 0, alreadyDone = 0, stale = 0
    async function finishRecovery(item:Item,proposal:ReturnType<typeof sourceRecoveryProposal>){
      if(dryRun){if(proposal.extraction_meta.applied)extracted++;else skipped++;return}
      const{data,error}=await supabase.rpc('finish_review_news_source_recovery',{
        p_id:item.id,p_lease_token:item.lease_token,p_normalized:proposal,
      })
      if(error)throw Error(`source recovery persistence: ${error.message}`)
      if(data?.saved!==true){stale++;return}
      if(data.recovered===true)extracted++;else skipped++
    }

    for (const item of items) {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const recoveryInput=repairTruncated?recoverySource(n):null
      let persistenceAttempted=false

      // Idempotency: already processed in a prior run.
      if (n.extraction_meta) { alreadyDone++; continue }

      // News rows carry `url`; venue/event rows carry `website`. Accept both.
      const url = repairTruncated ? recoveryInput?.url??'' : String(
        n.url ??
        n.website ??
        n.source_url ??
        (Array.isArray(n.urls) ? (n.urls as unknown[])[0] : '') ??
        '',
      ).trim()

      const rssContent = repairTruncated?recoveryInput?.content??'':String(n.content ?? n.description ?? '')

      try {
        if (!/^https?:\/\//i.test(url)) {
          if(repairTruncated){
            persistenceAttempted=true
            await finishRecovery(item,sourceRecoveryProposal(n,{body:'',method:'invalid_source_url',url:recoveryInput?.capturedUrl??'',at:new Date().toISOString()}))
          }else skipped++
          continue
        }
        // Primary: the extract worker (cleaned markdown + plain-text body + meta).
        const ext = await extractContent(supabase, { url })

        // Fallback: local readability-lite when the worker is down / circuit open.
        let bodyText: string
        let extractMethod: string
        let markdown: string | null = null
        let metaAuthor: string | null = null
        let metaPublished: string | null = null
        let metaImage: string | null = null
        let metaLang: string | null = null
        let pageTitle: string | null = null

        if (ext) {
          markdown = ext.markdown || null
          bodyText = ext.markdown ? markdownToText(ext.markdown) : ''
          extractMethod = `worker:${ext.method}`
          pageTitle=ext.meta.title
          metaAuthor = personAuthorCandidate(ext.meta.author, [n.source_name as string, n.publisher_name as string])
          // The extract worker's metadata can be a profile URL or team credit.
          // Recover a visible person byline even when its body extraction succeeded.
          if (!repairTruncated && !metaAuthor && !personAuthorCandidate(n.author) && targetTable === 'news_articles') {
            const html = await fetchHtml(url)
            metaAuthor = html ? extractArticle(html, url).author : null
          }
          metaPublished = ext.meta.publishedAt
          metaImage = ext.meta.image
          metaLang = ext.meta.lang
        } else {
          const html = repairTruncated ? await fetchRecoveryHtml(url) : await fetchHtml(url)
          const art = html ? extractArticle(html, url) : null
          bodyText = art?.content ?? ''
          extractMethod = art ? `local:${art.method}` : 'fetch_failed'
          pageTitle=repairTruncated&&html?recoveryPageTitle(html):null
          metaAuthor = art?.author ?? null
          metaPublished = art?.publishedAt ?? null
          metaImage = art?.imageUrl ?? null
          metaLang = art?.lang ?? null
        }

        if(repairTruncated){
          const proposal=sourceRecoveryProposal(n,{body:bodyText,markdown,method:extractMethod,url,pageTitle,at:new Date().toISOString()})
          persistenceAttempted=true
          await finishRecovery(item,proposal)
          continue
        }

        const meta: Record<string, unknown> = {
          method: extractMethod,
          run_at: new Date().toISOString(),
          original_length: rssContent.length,
          extracted_length: bodyText.length,
          has_markdown: !!markdown,
          applied: false,
        }

        const merged: Record<string, unknown> = { ...n }

        // Stash cleaned markdown for the enrich stage regardless of the body swap.
        if (markdown) merged.markdown = markdown

        // Swap in full text only when it's a clear gain over the RSS stub.
        if (
          bodyText &&
          bodyText.length > rssContent.length * MIN_GAIN_RATIO &&
          bodyText.length >= 250
        ) {
          merged.content = bodyText
          meta.applied = true
          extracted++
        } else {
          skipped++
        }

        // Backfill thin/empty metadata from the page even when body wasn't swapped.
        if (targetTable === 'news_articles') {
          const credits = [n.source_name as string, n.publisher_name as string]
          const previous = personAuthorCandidate(n.author, credits)
          merged.author = previous ?? personAuthorCandidate(metaAuthor, credits)
          if (n.author && !previous) merged.original_author = n.original_author ?? n.author
        } else if (metaAuthor && !n.author) merged.author = metaAuthor
        if (metaPublished && !n.published_at) merged.published_at = metaPublished
        if (metaImage && !n.image_url && !(Array.isArray(n.images) && n.images.length)) {
          merged.image_url = metaImage
        }
        if (metaLang && !n.lang) merged.lang = metaLang

        merged.extraction_meta = meta

        if (!dryRun) {
          const { error: upErr } = await supabase
            .from('ingestion_staging')
            .update({ normalized_data: merged, updated_at: new Date().toISOString() })
            .eq('id', item.id)
          if (upErr) { failed++; console.error(`extract update ${item.id}: ${upErr.message}`); continue }
        }
      } catch (e) {
        let recorded=false
        console.error(`extract ${item.id}: ${(e as Error).message}`)
        if(repairTruncated&&!dryRun&&!persistenceAttempted){
          // A failed fetch is a bounded source outcome, never a new publication verdict.
          try {await finishRecovery(item,sourceRecoveryProposal(n,{body:'',method:'fetch_failed',url:recoveryInput?.capturedUrl??'',at:new Date().toISOString()}));recorded=true}
          catch(error){console.error(`source recovery outcome ${item.id}: ${(error as Error).message}`)}
        }
        if(!recorded)failed++
      }
    }

    return jsonResponse({
      success: true,
      items: extracted + skipped + alreadyDone,
      items_total: items.length,
      items_processed: extracted + skipped + failed + alreadyDone + stale,
      items_succeeded: extracted,
      items_failed: failed,
      extracted, skipped, already_done: alreadyDone, failed,
      dry_run: dryRun,
      ...(repairTruncated?{repair_truncated:true,stale}:{}),
    }, 200, req)
  } catch (error) {
    console.error('pipeline-extract-fulltext:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
