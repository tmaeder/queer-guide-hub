import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message, success: false }, status)
}

const HEAD_TIMEOUT = 5_000
const GET_TIMEOUT = 10_000
const MAX_REDIRECTS = 5
const BETWEEN_CHECK_DELAY = 500
const DEFAULT_BATCH_LIMIT = 50

/** Ensure URL has a protocol prefix */
function normalizeUrl(url: string): string {
  if (!url) return url
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

interface CheckResult {
  status: 'OK' | 'BROKEN' | 'REDIRECT' | 'BLOCKED' | 'TIMEOUT'
  httpStatus: number | null
  finalUrl: string | null
  error: string | null
}

/** Perform HTTP HEAD then GET fallback to check a URL */
async function checkUrl(rawUrl: string): Promise<CheckResult> {
  const url = normalizeUrl(rawUrl)
  if (!url) return { status: 'BROKEN', httpStatus: null, finalUrl: null, error: 'Empty URL' }

  try {
    // Try HEAD first (faster, less bandwidth)
    let resp: Response
    try {
      resp = await fetchWithTimeout(url, 'HEAD', HEAD_TIMEOUT)
    } catch (_headErr) {
      // HEAD failed — try GET
      resp = await fetchWithTimeout(url, 'GET', GET_TIMEOUT)
    }

    const httpStatus = resp.status
    const finalUrl = resp.url !== url ? resp.url : null

    // 2xx = OK
    if (httpStatus >= 200 && httpStatus < 300) {
      if (finalUrl) {
        return { status: 'REDIRECT', httpStatus, finalUrl, error: null }
      }
      return { status: 'OK', httpStatus, finalUrl: null, error: null }
    }

    // 3xx redirect (shouldn't happen with redirect: follow, but just in case)
    if (httpStatus >= 300 && httpStatus < 400) {
      return { status: 'REDIRECT', httpStatus, finalUrl: resp.headers.get('location') || finalUrl, error: null }
    }

    // 401/403 = BLOCKED (could be geo-restricted or login-required)
    if (httpStatus === 401 || httpStatus === 403) {
      return { status: 'BLOCKED', httpStatus, finalUrl: null, error: `HTTP ${httpStatus}` }
    }

    // 4xx/5xx = BROKEN
    return { status: 'BROKEN', httpStatus, finalUrl: null, error: `HTTP ${httpStatus}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('AbortError')) {
      return { status: 'TIMEOUT', httpStatus: null, finalUrl: null, error: 'Request timed out' }
    }
    return { status: 'BROKEN', httpStatus: null, finalUrl: null, error: msg.substring(0, 200) }
  }
}

async function fetchWithTimeout(url: string, method: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; QueerGuide-LinkChecker/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
    })
    return resp
  } finally {
    clearTimeout(timer)
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let mode = 'validate'
    let linkIds: string[] | undefined
    let batchLimit = DEFAULT_BATCH_LIMIT

    if (req.method === 'GET') {
      const url = new URL(req.url)
      mode = url.searchParams.get('mode') || 'validate'
      batchLimit = parseInt(url.searchParams.get('batch_limit') ?? '') || DEFAULT_BATCH_LIMIT
    } else {
      const body = await req.json().catch(() => ({}))
      mode = body.mode ?? 'validate'
      linkIds = body.link_ids
      batchLimit = body.batch_limit ?? DEFAULT_BATCH_LIMIT
    }

    console.log(`[validate-links] mode=${mode}, linkIds=${linkIds?.length ?? 'none'}, batchLimit=${batchLimit}`)

    let links: any[]

    if (mode === 'single' && linkIds?.length) {
      // Validate specific links by ID
      const { data, error } = await supabase
        .from('content_links')
        .select('*')
        .in('id', linkIds)
        .neq('status', 'DISMISSED')
      if (error) throw error
      links = data ?? []
    } else if (mode === 'recheck') {
      // Find broken links due for their next scheduled recheck
      const { data, error } = await supabase.rpc('get_links_due_for_recheck', { batch_limit: batchLimit })
      if (error) {
        console.error('[validate-links] RPC error:', JSON.stringify(error))
        throw error
      }
      links = data ?? []
      console.log(`[validate-links] Recheck: found ${links.length} links due`)
    } else if (mode === 'validate') {
      // Validate PENDING links (initial check)
      const { data, error } = await supabase
        .from('content_links')
        .select('*')
        .eq('status', 'PENDING')
        .order('last_checked_at', { ascending: true, nullsFirst: true })
        .limit(batchLimit)
      if (error) throw error
      links = data ?? []
      console.log(`[validate-links] Validate: found ${links.length} PENDING links`)
    } else {
      return errorResponse(`Invalid mode: ${mode}. Use "validate", "recheck", or "single".`, 400)
    }

    if (!links.length) {
      return jsonResponse({
        checked: 0, recovered: 0, still_broken: 0, auto_removed: 0, errors: 0,
        message: 'No links to process',
      })
    }

    let checked = 0
    let recovered = 0
    let stillBroken = 0
    let autoRemoved = 0
    let errorCount = 0
    const results: Array<{
      id: string; url: string; status: string;
      previous_status?: string; check_count?: number; error?: string;
    }> = []

    for (let i = 0; i < links.length; i++) {
      const link = links[i]
      try {
        const previousStatus = link.status
        const previousCheckCount = link.check_count ?? 0
        console.log(`[validate-links] [${i + 1}/${links.length}] Checking: ${link.original_url} (status=${previousStatus}, check_count=${previousCheckCount})`)

        const result = await checkUrl(link.original_url)
        console.log(`[validate-links] Result: status=${result.status} http=${result.httpStatus} final=${result.finalUrl ?? 'none'}`)

        // Determine new check_count
        let newCheckCount = previousCheckCount
        const wasBroken = previousStatus === 'BROKEN' || previousStatus === 'TIMEOUT'

        if (result.status === 'OK' || result.status === 'REDIRECT') {
          // Link recovered — reset check_count
          if (wasBroken && previousCheckCount > 0) {
            recovered++
            console.log(`[validate-links] RECOVERED: ${link.original_url} (was check_count=${previousCheckCount})`)
          }
          newCheckCount = 0
        } else if (result.status === 'BROKEN' || result.status === 'TIMEOUT') {
          // Still broken — increment check_count
          newCheckCount = previousCheckCount + 1
          console.log(`[validate-links] Still broken: ${link.original_url} check_count ${previousCheckCount} → ${newCheckCount}`)

          // If check_count reaches 4 after 3 failed rechecks → auto-remove
          if (newCheckCount >= 4) {
            console.log(`[validate-links] AUTO-REMOVING: ${link.original_url} after ${newCheckCount - 1} failed rechecks`)
            const { error: rpcErr } = await supabase.rpc('auto_remove_broken_link', { link_id: link.id })
            if (rpcErr) {
              console.error(`[validate-links] Auto-remove RPC failed:`, JSON.stringify(rpcErr))
              errorCount++
              results.push({
                id: link.id, url: link.original_url, status: 'ERROR',
                previous_status: previousStatus, check_count: newCheckCount,
                error: `Auto-remove failed: ${rpcErr.message}`,
              })
            } else {
              autoRemoved++
              results.push({
                id: link.id, url: link.original_url, status: 'AUTO_REMOVED',
                previous_status: previousStatus, check_count: newCheckCount,
              })
            }
            checked++
            if (i < links.length - 1) await delay(BETWEEN_CHECK_DELAY)
            continue // Skip normal update — auto_remove_broken_link handles it
          }

          stillBroken++
        } else if (result.status === 'BLOCKED') {
          // BLOCKED: increment check_count but do NOT auto-remove
          newCheckCount = previousCheckCount + 1
          // Cap at 3 — blocked links don't escalate to removal
          if (newCheckCount > 3) newCheckCount = 3
        }

        // Update the content_links row
        const updatePayload: Record<string, unknown> = {
          status: result.status,
          http_status: result.httpStatus,
          last_checked_at: new Date().toISOString(),
          check_count: newCheckCount,
        }
        if (result.finalUrl) {
          updatePayload.final_url = result.finalUrl
          updatePayload.cleaned_url = result.finalUrl
        }

        const { error: updateErr } = await supabase
          .from('content_links')
          .update(updatePayload)
          .eq('id', link.id)

        if (updateErr) {
          console.error(`[validate-links] DB update failed for ${link.id}:`, JSON.stringify(updateErr))
          errorCount++
          results.push({
            id: link.id, url: link.original_url, status: 'ERROR',
            error: `DB update: ${updateErr.message}`,
          })
        } else {
          checked++
          results.push({
            id: link.id, url: link.original_url, status: result.status,
            previous_status: previousStatus, check_count: newCheckCount,
          })
        }

        // Rate limit delay
        if (i < links.length - 1) await delay(BETWEEN_CHECK_DELAY)
      } catch (e) {
        console.error(`[validate-links] Error processing ${link.original_url}:`, e)
        errorCount++
        results.push({ id: link.id, url: link.original_url, status: 'ERROR', error: String(e) })
      }
    }

    const response = { checked, recovered, still_broken: stillBroken, auto_removed: autoRemoved, errors: errorCount, total: links.length, results }
    console.log(`[validate-links] Done: checked=${checked} recovered=${recovered} still_broken=${stillBroken} auto_removed=${autoRemoved} errors=${errorCount}`)
    return jsonResponse(response)
  } catch (e) {
    console.error('[validate-links] Fatal error:', e)
    return errorResponse(e instanceof Error ? e.message : 'Internal error', 500)
  }
})

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
