/**
 * Public, tightly scoped feedback/correction intake.
 *
 * This is intentionally separate from upload-image-r2: anonymous callers can
 * attach an automatically captured page screenshot, but cannot select an R2
 * namespace or write a directory entity.
 */

import {
  corsResponse,
  errorResponse,
  getCorsHeaders,
  getServiceClient,
  jsonResponse,
} from '../_shared/supabase-client.ts'
import { checkIpRateLimit } from '../_shared/ip-rate-limit.ts'
import { logoMirrorConfigured, mirrorImageToR2 } from '../_shared/logo-mirror.ts'
import { validateCommunityReportBody } from '../_shared/community-report.ts'

const MAX_REQUEST_BYTES = 4_300_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('POST only', 405, req)

  const origin = req.headers.get('Origin')
  if (origin && !getCorsHeaders(req)['Access-Control-Allow-Origin']) {
    return errorResponse('Origin not allowed', 403, req)
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse('Request too large', 413, req)
  }

  if (!(await checkIpRateLimit(req, 'submit-community-report', 20, 3600))) {
    return errorResponse('Too many reports. Please try again later.', 429, req)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400, req)
  }

  const validation = validateCommunityReportBody(body)
  if (!validation.ok) return errorResponse(validation.error, 400, req)
  const report = validation.value
  if (report.discard) {
    return jsonResponse({ id: crypto.randomUUID(), screenshotStored: false }, 201, req)
  }

  const admin = getServiceClient()
  let submittedBy: string | null = null
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (token) {
    const { data } = await admin.auth.getUser(token)
    submittedBy = data.user?.id ?? null
  }

  const { data: inserted, error: insertError } = await admin
    .from('community_submissions')
    .insert({
      content_type: report.kind,
      data: report.data,
      source_url: report.sourceUrl,
      submitted_by: submittedBy,
    })
    .select('id')
    .single()

  if (insertError || !inserted?.id) {
    console.error('[submit-community-report] insert failed', insertError?.message)
    return errorResponse('Could not submit report', 500, req)
  }

  let screenshotStored = false
  if (report.screenshot && logoMirrorConfigured()) {
    const screenshotUrl = await mirrorImageToR2(
      report.screenshot.bytes,
      report.screenshot.contentType,
      'feedback-screenshots',
    )
    if (screenshotUrl) {
      const data = { ...report.data, screenshot_url: screenshotUrl }
      const { error: updateError } = await admin
        .from('community_submissions')
        .update({ data })
        .eq('id', inserted.id)
      screenshotStored = !updateError
      if (updateError) {
        console.error('[submit-community-report] screenshot link failed', updateError.message)
      }
    }
  }

  return jsonResponse({ id: inserted.id, screenshotStored }, 201, req)
})
