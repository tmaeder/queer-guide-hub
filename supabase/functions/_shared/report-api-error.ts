/**
 * Shared API error reporter for Supabase edge functions.
 *
 * Two destinations:
 *   1. The feedback upsert RPC — kept for triage.
 *   2. Sentry, if SENTRY_DSN is set in the function env.
 *
 * Best-effort — never throws, never throws; bounded delivery is awaited before the response finishes.
 */

import { captureError, initSentry } from "./sentry.ts";

interface ReportOpts {
  status_code?: number
  endpoint?: string
  metadata?: Record<string, unknown>
}

export async function reportApiError(
  functionName: string,
  err: unknown,
  opts: ReportOpts = {},
): Promise<void> {
  // Send to Sentry first (synchronous capture, no network in the hot path).
  // initSentry is idempotent and no-ops without SENTRY_DSN.
  initSentry(functionName)
  captureError(err, {
    function: functionName,
    status_code: opts.status_code ?? 500,
    endpoint: opts.endpoint,
    ...(opts.metadata ?? {}),
  })

  // Then forward to the internal feedback ingest endpoint.
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const baseUrl = Deno.env.get('SUPABASE_URL')
    if (!serviceKey || !baseUrl) return
    const e = err as Error
    const message = e?.message ?? String(err)
    const normalized = message
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
      .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.Z+-]+/g, '<TS>')
      .replace(/\b\d{4,}\b/g, '<NUM>')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`edge-function:${functionName}:${normalized}`))
    const fingerprint = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
    // Use the existing RPC directly: no optional API_ERROR_SECRET dependency and
    // no ingest endpoint filter dropping contained 4xx failures (e.g. currency checks).
    const response = await fetch(`${baseUrl}/rest/v1/rpc/upsert_api_error`, {
      method: 'POST', signal: AbortSignal.timeout(5000),
      headers: {
        'Content-Type': 'application/json', apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        p_fingerprint: fingerprint, p_source: 'edge-function',
        p_data: {
          title: `[error] ${functionName}`,
          description: message.slice(0, 1000),
          service: 'edge-function', function_name: functionName,
          message: message.slice(0, 1000), stack: e?.stack?.slice(0, 5000),
          status_code: opts.status_code ?? 500, endpoint: opts.endpoint,
          metadata: opts.metadata, reported_at: new Date().toISOString(),
        },
      }),
    })
    if (!response.ok) console.error(`Feedback error filing failed for ${functionName}: HTTP ${response.status}`)

  } catch {
    // best-effort — never break the caller
  }
}

/**
 * Wrap a Deno.serve handler to auto-report unhandled exceptions and failed responses, excluding auth rejections.
 */
export function withErrorReporting(
  functionName: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      const resp = await handler(req)
      if (resp.status >= 400 && resp.status !== 401 && resp.status !== 403) {
        const body = await resp.clone().text().catch(() => '')
        await reportApiError(functionName, new Error(`${resp.status}: ${body.slice(0, 500)}`), {
          status_code: resp.status,
          endpoint: new URL(req.url).pathname,
        })
      }
      return resp
    } catch (err) {
      await reportApiError(functionName, err, {
        endpoint: new URL(req.url).pathname,
      })
      throw err
    }
  }
}
