/**
 * ingest-api-error — server-to-server endpoint.
 * Accepts API error reports from Workers, edge functions, Sentry, and scrapers.
 * Computes a fingerprint and upserts into community_submissions via RPC.
 * Auth: shared secret in X-Error-Secret header.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

interface ErrorPayload {
  service: string
  function_name: string
  message: string
  stack?: string
  status_code?: number
  endpoint?: string
  metadata?: Record<string, unknown>
}

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Strip UUIDs, timestamps, hex strings, and numbers from error messages for stable fingerprinting. */
function normalizeMessage(msg: string): string {
  return msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\dZ+:-]*/g, '<TS>')
    .replace(/0x[0-9a-f]+/gi, '<HEX>')
    .replace(/\b\d{4,}\b/g, '<NUM>')
    .trim()
}

async function computeFingerprint(service: string, fn: string, message: string): Promise<string> {
  const raw = `${service}:${fn}:${normalizeMessage(message)}`
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }
  if (req.method !== 'POST') {
    return jsonResp({ error: 'Method not allowed' }, 405)
  }

  // Auth via shared secret
  const secret = Deno.env.get('API_ERROR_SECRET')
  if (!secret || req.headers.get('X-Error-Secret') !== secret) {
    return jsonResp({ error: 'Unauthorized' }, 401)
  }

  let payload: ErrorPayload
  try {
    payload = await req.json()
  } catch {
    return jsonResp({ error: 'Invalid JSON' }, 400)
  }

  const { service, function_name, message, stack, status_code, endpoint, metadata } = payload

  if (!service || !function_name || !message) {
    return jsonResp({ error: 'Missing required fields: service, function_name, message' }, 400)
  }

  // Filter: only 5xx / unhandled (status_code undefined = unhandled exception)
  if (status_code !== undefined && status_code < 500) {
    return jsonResp({ skipped: true, reason: 'Only 5xx and unhandled errors are ingested' }, 200)
  }

  const fingerprint = await computeFingerprint(service, function_name, message)

  const data: Record<string, unknown> = {
    service,
    function_name,
    message,
    stack: stack?.slice(0, 5000),
    status_code,
    endpoint,
    metadata,
    reported_at: new Date().toISOString(),
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: result, error } = await supabase.rpc('upsert_api_error', {
    p_fingerprint: fingerprint,
    p_data: data,
    p_source: service,
  })

  if (error) {
    return jsonResp({ error: `RPC failed: ${error.message}` }, 500)
  }

  return jsonResp({ success: true, id: result, fingerprint })
})
