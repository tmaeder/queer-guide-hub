// Evidence-only event image auditor. It never adds or replaces event images.
// Auth: EVENT_QUALITY_WEBHOOK_SECRET or internal/admin credentials.

import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { probeForRole } from '../_shared/image-probe.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'

const DETECTOR = 'event-image-quality'
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

type Severity = 'critical' | 'high' | 'medium' | 'low'
type Finding = { code: string; severity: Severity; evidence: Record<string, unknown> }
type DbError = { message: string } | null
type ImageCandidate = { event_id: string; image_url: string }

function requireDb(error: DbError, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message}`)
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digestInput = new Uint8Array(bytes).buffer
  return hex(await crypto.subtle.digest('SHA-256', digestInput))
}

async function fetchContentHash(rawUrl: string, signal: AbortSignal): Promise<string | null> {
  let url = assertPublicHttpUrl(rawUrl)
  for (let redirects = 0; redirects <= 4; redirects++) {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': 'QueerGuide-EventImageQuality/1.0', Accept: 'image/*' },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return null
      url = assertPublicHttpUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok || !response.body) return null
    const announced = Number(response.headers.get('content-length') ?? 0)
    if (announced > MAX_IMAGE_BYTES) {
      await response.body.cancel()
      return null
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    const all = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      all.set(chunk, offset)
      offset += chunk.length
    }
    return sha256(all)
  }
  return null
}

function findingForProbe(probe: Awaited<ReturnType<typeof probeForRole>>): Finding | null {
  const evidence = {
    url: probe.url,
    http_status: probe.status ?? null,
    mime_type: probe.contentType ?? null,
    byte_size: probe.bytes ?? null,
    width: probe.width ?? null,
    height: probe.height ?? null,
    reason: probe.failReason ?? probe.reason ?? null,
  }
  const reason = probe.failReason ?? probe.reason
  if (!probe.passed) {
    if (reason === 'not_image') return { code: 'IMAGE_MIME_INVALID', severity: 'high', evidence }
    if (reason === 'too_small_bytes' || reason === 'cover_low_bytes') {
      return { code: 'IMAGE_TOO_SMALL', severity: 'high', evidence }
    }
    if (reason === 'low_resolution' || reason === 'cover_too_small' || reason === 'cover_portrait') {
      return { code: 'IMAGE_LOW_RESOLUTION', severity: 'high', evidence }
    }
    return { code: 'IMAGE_UNREACHABLE', severity: 'high', evidence }
  }
  if (!probe.width || !probe.height) {
    return { code: 'IMAGE_DIMENSIONS_UNKNOWN', severity: 'low', evidence }
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'EVENT_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const claimToken = crypto.randomUUID()
  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.max(0, Math.min(Number(body.batch_size ?? 25), 100))
    const dryRun = body.dry_run !== false
    const { data: candidates, error } = await supabase.rpc('claim_event_image_quality_candidates', {
      p_claim_token: claimToken,
      p_limit: batchSize,
    })
    if (error) return errorResponse(error.message, 500, req)

    const results: Array<Record<string, unknown>> = []
    const candidateRows = (candidates ?? []) as ImageCandidate[]
    for (let offset = 0; offset < candidateRows.length; offset += 5) {
      const batchResults = await Promise.all(
        candidateRows.slice(offset, offset + 5).map(async (candidate) => {
          const eventId = String(candidate.event_id)
          const imageUrl = String(candidate.image_url)
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 15_000)
          try {
            assertPublicHttpUrl(imageUrl)
            const probe = await probeForRole(imageUrl, 'cover', controller.signal)
            let contentHash: string | null = null
            let hashFailure: string | null = null
            if (probe.passed) {
              try {
                contentHash = await fetchContentHash(imageUrl, controller.signal)
                if (!contentHash) hashFailure = 'content_hash_unavailable'
              } catch (error) {
                hashFailure = error instanceof Error ? error.message : String(error)
              }
            }
            const findings: Finding[] = []
            const probeFinding = findingForProbe(probe)
            if (probeFinding) findings.push(probeFinding)
            if (probe.passed && !contentHash) {
              findings.push({
                code: 'IMAGE_HASH_UNAVAILABLE',
                severity: 'low',
                evidence: { url: imageUrl, reason: hashFailure },
              })
            }

            if (!dryRun) {
              const observationResult = await supabase.from('event_image_quality_observations').upsert(
                {
                  event_id: eventId,
                  image_url: imageUrl,
                  url_hash: await sha256(imageUrl),
                  content_hash: contentHash,
                  http_status: probe.status ?? null,
                  mime_type: probe.contentType ?? null,
                  byte_size: probe.bytes ?? null,
                  width: probe.width ?? null,
                  height: probe.height ?? null,
                  probe_status: probe.passed ? 'pass' : 'fail',
                  failure_reason: probe.failReason ?? probe.reason ?? null,
                  checked_at: new Date().toISOString(),
                },
                { onConflict: 'event_id,image_url' },
              )
              requireDb(observationResult.error, 'persist image observation')

              if (contentHash) {
                const { count, error: reuseError } = await supabase
                  .from('event_image_quality_observations')
                  .select('event_id', { count: 'exact', head: true })
                  .eq('content_hash', contentHash)
                requireDb(reuseError, 'count reused image content')
                if ((count ?? 0) >= 10) {
                  findings.push({
                    code: 'IMAGE_CONTENT_REUSED',
                    severity: 'medium',
                    evidence: { url: imageUrl, content_hash: contentHash, event_count: count },
                  })
                }
              }

              const activeCodes = findings.map((f) => f.code)
              for (const finding of findings) {
                const evidenceHash = await sha256(JSON.stringify(finding.evidence))
                const { data: accepted, error: acceptedError } = await supabase
                  .from('event_quality_issues')
                  .select('id')
                  .eq('event_id', eventId)
                  .eq('issue_code', finding.code)
                  .eq('status', 'accepted')
                  .eq('evidence_hash', evidenceHash)
                  .maybeSingle()
                requireDb(acceptedError, 'load accepted image issue')
                if (accepted) continue
                const { data: open, error: openError } = await supabase
                  .from('event_quality_issues')
                  .select('id')
                  .eq('event_id', eventId)
                  .eq('issue_code', finding.code)
                  .eq('status', 'open')
                  .maybeSingle()
                requireDb(openError, 'load open image issue')
                const issue = {
                  event_id: eventId,
                  dimension: 'media',
                  issue_code: finding.code,
                  detector: DETECTOR,
                  severity: finding.severity,
                  evidence: finding.evidence,
                  evidence_hash: evidenceHash,
                  last_seen_at: new Date().toISOString(),
                }
                const issueResult = open
                  ? await supabase.from('event_quality_issues').update(issue).eq('id', open.id)
                  : await supabase.from('event_quality_issues').insert(issue)
                requireDb(issueResult.error, 'persist image issue')
              }

              let clear = supabase
                .from('event_quality_issues')
                .update({
                  status: 'resolved',
                  resolved_at: new Date().toISOString(),
                  reviewed_at: new Date().toISOString(),
                  resolution: 'cleared_by_image_audit',
                })
                .eq('event_id', eventId)
                .eq('detector', DETECTOR)
                .eq('status', 'open')
              if (activeCodes.length) clear = clear.not('issue_code', 'in', `(${activeCodes.join(',')})`)
              const clearResult = await clear
              requireDb(clearResult.error, 'resolve cleared image issues')

              // Do not write event_quality_current here. The SQL scanner owns
              // current assessments and notices external-detector issue changes
              // through last_seen_at/resolved_at. Keeping this worker on the
              // issues table avoids an issues→current lock order that can
              // deadlock with the scanner's current→issues transaction.
            }
            return {
              event_id: eventId,
              image_url: imageUrl,
              passed: probe.passed,
              content_hash: contentHash,
              issues: findings.map((f) => f.code),
            }
          } catch (caught) {
            return {
              event_id: eventId,
              image_url: imageUrl,
              passed: false,
              error: caught instanceof Error ? caught.message : String(caught),
            }
          } finally {
            clearTimeout(timer)
          }
        }),
      )
      results.push(...batchResults)
    }
    const failures = results.filter((result) => 'error' in result).length
    return jsonResponse(
      { success: failures === 0, dry_run: dryRun, checked: results.length, failures, results },
      failures === 0 ? 200 : 500,
      req,
    )
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error), 500, req)
  } finally {
    const { error } = await supabase.rpc('release_event_quality_worker_lease', {
      p_worker: DETECTOR,
      p_claim_token: claimToken,
    })
    if (error) console.error('release event image quality lease:', error.message)
  }
})

