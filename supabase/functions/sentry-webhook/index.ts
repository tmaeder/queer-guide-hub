/**
 * sentry-webhook — receives Sentry issue alert webhooks.
 * Transforms payload into the ingest-api-error format and forwards internally.
 * Only processes 'created' actions (new issues).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return expected === signature
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405)

  const webhookSecret = Deno.env.get('SENTRY_WEBHOOK_SECRET')
  if (!webhookSecret) return jsonResp({ error: 'SENTRY_WEBHOOK_SECRET not configured' }, 500)

  const rawBody = await req.text()
  const signature = req.headers.get('sentry-hook-signature')
  const valid = await verifySignature(rawBody, signature, webhookSecret)
  if (!valid) return jsonResp({ error: 'Invalid signature' }, 401)

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    return jsonResp({ error: 'Invalid JSON' }, 400)
  }

  // Only process new issue creation
  if (event.action !== 'created') {
    return jsonResp({ skipped: true, reason: `Ignoring action: ${event.action}` }, 200)
  }

  const issueData = (event.data as Record<string, unknown>)?.issue as Record<string, unknown> | undefined
  if (!issueData) return jsonResp({ skipped: true, reason: 'No issue data' }, 200)

  const title = (issueData.title as string) || 'Unknown error'
  const culprit = (issueData.culprit as string) || ''
  const platform = (issueData.platform as string) || 'unknown'
  const issueUrl = (issueData.url as string) || ''

  // Map Sentry platform to service name
  let service = 'sentry'
  if (platform === 'javascript') service = 'frontend'
  else if (platform === 'node') service = 'scraper'
  else if (platform === 'python') service = 'scraper'

  // Check tags for more specific service info
  const tags = (issueData.tags as Array<{ key: string; value: string }>) || []
  const runtimeTag = tags.find((t) => t.key === 'runtime')
  if (runtimeTag?.value === 'cloudflare') service = 'cloudflare-worker'

  const ingestUrl = Deno.env.get('SUPABASE_URL')! + '/functions/v1/ingest-api-error'
  const errorSecret = Deno.env.get('API_ERROR_SECRET')
  if (!errorSecret) return jsonResp({ error: 'API_ERROR_SECRET not configured' }, 500)

  const payload = {
    service,
    function_name: culprit || 'unknown',
    message: title,
    stack: (issueData.metadata as Record<string, unknown>)?.value as string || '',
    status_code: 500,
    endpoint: issueUrl,
    metadata: {
      sentry_issue_id: issueData.id,
      sentry_url: issueUrl,
      platform,
      level: issueData.level || 'error',
      first_seen: issueData.firstSeen,
      tags,
    },
  }

  const resp = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Error-Secret': errorSecret,
    },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    return jsonResp({ error: `Ingest failed: ${errText}` }, 502)
  }

  const result = await resp.json()
  return jsonResp({ success: true, ...result })
})
