import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

const URLSCAN_API = 'https://urlscan.io/api/v1'
const SCAN_VISIBILITY = 'unlisted'
const POLL_INITIAL_WAIT = 12_000
const POLL_INTERVAL = 5_000
const POLL_MAX_WAIT = 60_000
const BETWEEN_SCAN_DELAY = 2_000
const DEFAULT_BATCH_LIMIT = 10
const STALE_DAYS = 7

interface ScanSubmission {
  uuid: string
  result: string
  api: string
  visibility: string
  url: string
}

interface ScanVerdict {
  uuid: string
  verdict: string | null
  score: number
  categories: string[]
  screenshotUrl: string
  brands: string[]
}

/** Ensure URL has a protocol prefix */
function normalizeUrl(url: string): string {
  if (!url) return url
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const apiKey = Deno.env.get('URLSCAN_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'URLSCAN_API_KEY environment variable is not configured', success: false }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    let linkIds: string[] | undefined
    let batch = false
    let batchLimit = DEFAULT_BATCH_LIMIT

    if (req.method === 'GET') {
      const url = new URL(req.url)
      batch = url.searchParams.get('batch') === 'true'
      batchLimit = parseInt(url.searchParams.get('batch_limit') ?? '') || DEFAULT_BATCH_LIMIT
    } else {
      const body = await req.json().catch(() => ({}))
      linkIds = body.link_ids
      batch = body.batch ?? false
      batchLimit = body.batch_limit ?? DEFAULT_BATCH_LIMIT
      console.log(`[scan-links] Request body: link_ids=${JSON.stringify(linkIds)}, batch=${batch}, batchLimit=${batchLimit}`)
    }

    let links: Record<string, unknown>[]

    if (linkIds?.length) {
      console.log(`[scan-links] Querying content_links for ${linkIds.length} IDs: ${JSON.stringify(linkIds)}`)

      // First, try a simple count to verify connectivity
      const { count: totalCount, error: countErr } = await supabase
        .from('content_links')
        .select('*', { count: 'exact', head: true })
      console.log(`[scan-links] Total rows in content_links: ${totalCount}, error: ${JSON.stringify(countErr)}`)

      const { data, error, status: respStatus, statusText } = await supabase
        .from('content_links')
        .select('id, original_url, scan_id, scanned_at')
        .in('id', linkIds)
      console.log(`[scan-links] Query response status: ${respStatus} ${statusText}`)
      if (error) {
        console.error('[scan-links] DB fetch error:', JSON.stringify(error))
        throw error
      }
      links = data ?? []
      console.log(`[scan-links] Fetched ${links.length} links from DB (data was ${data === null ? 'null' : 'array'})`)
      if (links.length > 0) {
        console.log(`[scan-links] First link: ${JSON.stringify(links[0])}`)
      } else {
        console.warn(`[scan-links] WARNING: 0 links found! IDs queried: ${JSON.stringify(linkIds)}`)
        // Try fetching without .in() filter to see if ANY rows are accessible
        const { data: anyData, error: anyErr } = await supabase
          .from('content_links')
          .select('id')
          .limit(3)
        console.log(`[scan-links] Debug: any rows accessible? ${anyData?.length ?? 0} rows, error: ${JSON.stringify(anyErr)}`)
        if (anyData?.length) {
          console.log(`[scan-links] Debug: sample accessible IDs: ${JSON.stringify(anyData.map((r: unknown) => r.id))}`)
        }
      }
    } else if (batch) {
      const staleDate = new Date(Date.now() - STALE_DAYS * 86400000).toISOString()
      const { data, error } = await supabase
        .from('content_links')
        .select('id, original_url, scan_id, scanned_at, status')
        .or(`scanned_at.is.null,scanned_at.lt.${staleDate}`)
        .neq('status', 'DISMISSED')
        .order('status', { ascending: true })
        .order('scanned_at', { ascending: true, nullsFirst: true })
        .limit(batchLimit)
      if (error) {
        console.error('[scan-links] DB batch fetch error:', JSON.stringify(error))
        throw error
      }
      links = data ?? []
      console.log(`[scan-links] Batch: fetched ${links.length} links`)
    } else {
      return new Response(
        JSON.stringify({ error: 'Provide link_ids or set batch=true', success: false }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    if (!links.length) {
      console.log('[scan-links] No links to scan')
      return new Response(
        JSON.stringify({ scanned: 0, malicious: 0, errors: 0, message: 'No links to scan' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    let scanned = 0
    let maliciousCount = 0
    let errorCount = 0
    const results: Array<{ id: string; url: string; verdict: string | null; error?: string }> = []

    for (let i = 0; i < links.length; i++) {
      const link = links[i]
      try {
        // Normalize URL to ensure it has protocol
        const scanUrl = normalizeUrl(link.original_url)
        console.log(`[scan-links] Processing [${i + 1}/${links.length}]: ${scanUrl} (original: ${link.original_url})`)

        // 1. Search for existing recent scan
        const existingScan = await searchExistingScan(apiKey, scanUrl)
        let scanResult: ScanVerdict

        if (existingScan) {
          console.log(`[scan-links] Found existing scan: ${existingScan.uuid} verdict=${existingScan.verdict} score=${existingScan.score}`)
          scanResult = existingScan
        } else {
          console.log(`[scan-links] No existing scan found, submitting new scan for: ${scanUrl}`)
          // 2. Submit new scan
          let submission: ScanSubmission | null = null
          try {
            submission = await submitScan(apiKey, scanUrl)
          } catch (submitErr) {
            errorCount++
            results.push({ id: link.id, url: scanUrl, verdict: null, error: 'Scan submission failed' })
            console.error(`[scan-links] Submission failed for ${scanUrl}:`, submitErr)
            continue
          }
          if (!submission) {
            errorCount++
            results.push({ id: link.id, url: scanUrl, verdict: null, error: 'Submission returned empty' })
            continue
          }
          console.log(`[scan-links] Submitted scan: ${submission.uuid}, polling for result...`)

          // 3. Poll for result
          scanResult = await pollForResult(apiKey, submission.uuid)
          console.log(`[scan-links] Poll result: verdict=${scanResult.verdict} score=${scanResult.score}`)
        }

        // 4. Update content_links
        const updatePayload = {
          scan_id: scanResult.uuid,
          scan_verdict: scanResult.verdict,
          scan_score: scanResult.score,
          scan_categories: scanResult.categories,
          scan_screenshot_url: scanResult.screenshotUrl,
          scan_brands: scanResult.brands,
          scanned_at: new Date().toISOString(),
        }
        console.log(`[scan-links] Updating DB for ${link.id}:`, JSON.stringify(updatePayload))

        const { error: updateErr, count } = await supabase
          .from('content_links')
          .update(updatePayload)
          .eq('id', link.id)

        if (updateErr) {
          console.error(`[scan-links] DB update failed for ${link.id}:`, JSON.stringify(updateErr))
          errorCount++
          results.push({ id: link.id, url: scanUrl, verdict: scanResult.verdict, error: 'DB update failed' })
        } else {
          console.log(`[scan-links] DB update success for ${link.id} (count: ${count})`)
          scanned++
          if (scanResult.verdict === 'malicious') maliciousCount++
          results.push({ id: link.id, url: scanUrl, verdict: scanResult.verdict })
        }

        // Rate limit delay between scans
        if (i < links.length - 1) {
          await delay(BETWEEN_SCAN_DELAY)
        }
      } catch (e) {
        console.error(`[scan-links] Error processing ${link.original_url}:`, e)
        errorCount++
        results.push({ id: link.id, url: link.original_url, verdict: null, error: 'Internal server error' })
      }
    }

    const response = { scanned, malicious: maliciousCount, errors: errorCount, total: links.length, results }
    console.log(`[scan-links] Final response:`, JSON.stringify(response))
    return new Response(
      JSON.stringify(response),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('[scan-links] Fatal error:', e)
    return new Response(
      JSON.stringify({ error: 'Internal server error', success: false }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})

// --- URLScan.io API helpers ---

async function searchExistingScan(apiKey: string, url: string): Promise<ScanVerdict | null> {
  try {
    const domain = new URL(url).hostname
    const searchUrl = `${URLSCAN_API}/search/?q=domain:${encodeURIComponent(domain)}&size=1`
    console.log(`[scan-links] Searching URLScan: ${searchUrl}`)
    const resp = await fetch(searchUrl, { headers: { 'API-Key': apiKey } })

    if (!resp.ok) {
      const text = await resp.text()
      console.warn(`[scan-links] Search API returned ${resp.status}: ${text}`)
      return null
    }

    const data = await resp.json()
    console.log(`[scan-links] Search returned ${data.results?.length ?? 0} results`)
    if (!data.results?.length) return null

    const result = data.results[0]
    const scanDate = new Date(result.task?.time ?? 0)
    const ageMs = Date.now() - scanDate.getTime()
    const ageDays = Math.round(ageMs / 86400000)
    console.log(`[scan-links] Found scan ${result._id}, age: ${ageDays} days, URL: ${result.task?.url}`)

    // Only reuse if less than 7 days old
    if (ageMs > STALE_DAYS * 86400000) {
      console.log(`[scan-links] Scan too old (${ageDays} days), will submit fresh`)
      return null
    }

    // Fetch full result for verdict details
    return await fetchScanResult(apiKey, result._id)
  } catch (e) {
    console.warn('[scan-links] Search failed:', e)
    return null
  }
}

async function submitScan(apiKey: string, url: string): Promise<ScanSubmission | null> {
  try {
    console.log(`[scan-links] Submitting scan for: ${url}`)
    const resp = await fetch(`${URLSCAN_API}/scan/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'API-Key': apiKey },
      body: JSON.stringify({ url, visibility: SCAN_VISIBILITY, tags: ['queer-guide', 'link-health'] }),
    })

    if (resp.status === 429) {
      console.warn('[scan-links] Rate limited (429), skipping')
      throw new Error('URLScan.io rate limited (429) — try again later')
    }
    if (!resp.ok) {
      const text = await resp.text()
      console.error(`[scan-links] Submit failed (${resp.status}): ${text}`)
      throw new Error(`URLScan.io submit failed (${resp.status})`)
    }
    const submission = await resp.json() as ScanSubmission
    console.log(`[scan-links] Submit success: uuid=${submission.uuid}`)
    return submission
  } catch (e) {
    console.error('[scan-links] Submit error:', e)
    throw e instanceof Error ? e : new Error(String(e))
  }
}

async function pollForResult(apiKey: string, uuid: string): Promise<ScanVerdict> {
  console.log(`[scan-links] Waiting ${POLL_INITIAL_WAIT / 1000}s before first poll...`)
  await delay(POLL_INITIAL_WAIT)
  const startTime = Date.now()
  let attempt = 0
  while (Date.now() - startTime < POLL_MAX_WAIT) {
    attempt++
    console.log(`[scan-links] Poll attempt ${attempt} for ${uuid}`)
    const result = await fetchScanResult(apiKey, uuid)
    if (result) {
      console.log(`[scan-links] Poll success for ${uuid}: verdict=${result.verdict}`)
      return result
    }
    console.log(`[scan-links] Not ready yet, waiting ${POLL_INTERVAL / 1000}s...`)
    await delay(POLL_INTERVAL)
  }
  console.warn(`[scan-links] Poll timeout for ${uuid} after ${attempt} attempts`)
  return { uuid, verdict: null, score: 0, categories: [], screenshotUrl: `https://urlscan.io/screenshots/${uuid}.png`, brands: [] }
}

async function fetchScanResult(apiKey: string, uuid: string): Promise<ScanVerdict | null> {
  try {
    const resp = await fetch(`${URLSCAN_API}/result/${uuid}/`, { headers: { 'API-Key': apiKey } })
    if (resp.status === 404) { console.log(`[scan-links] Result 404 for ${uuid} (not ready)`); return null }
    if (resp.status === 410) { console.log(`[scan-links] Result 410 for ${uuid} (deleted)`); return null }
    if (!resp.ok) { console.warn(`[scan-links] Result API returned ${resp.status} for ${uuid}`); return null }

    const data = await resp.json()
    const verdicts = data.verdicts ?? {}
    const overall = verdicts.overall ?? {}
    const urlscan = verdicts.urlscan ?? {}
    const community = verdicts.community ?? {}

    let verdict = 'benign'
    if (overall.malicious || urlscan.malicious || community.votesmalicious > 0) {
      verdict = 'malicious'
    } else if ((overall.score ?? 0) > 50 || (urlscan.score ?? 0) > 50 || (verdicts.engines?.malicious ?? []).length > 0) {
      verdict = 'suspicious'
    }

    const score = overall.score ?? urlscan.score ?? 0
    const categories: string[] = []
    if (urlscan.categories?.length) categories.push(...urlscan.categories)
    if (overall.tags?.length) categories.push(...overall.tags)
    const maliciousEngines = verdicts.engines?.malicious ?? []
    if (maliciousEngines.length) categories.push(...maliciousEngines.map((e: unknown) => e.engine ?? e))

    const brands: string[] = []
    if (urlscan.brands?.length) brands.push(...urlscan.brands.map((b: unknown) => typeof b === 'string' ? b : b.name ?? String(b)))
    if (data.meta?.processors?.['urlscan.io']?.brands?.length) brands.push(...data.meta.processors['urlscan.io'].brands.map((b: unknown) => b.name ?? String(b)))

    console.log(`[scan-links] Parsed result for ${uuid}: verdict=${verdict} score=${score} categories=${categories.join(',')} brands=${brands.join(',')}`)
    return { uuid, verdict, score, categories: [...new Set(categories)], screenshotUrl: `https://urlscan.io/screenshots/${uuid}.png`, brands: [...new Set(brands)] }
  } catch (e) {
    console.warn(`[scan-links] Fetch result error for ${uuid}:`, e)
    return null
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
