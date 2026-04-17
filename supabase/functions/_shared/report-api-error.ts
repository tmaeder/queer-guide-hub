/**
 * Shared API error reporter for Supabase edge functions.
 * POSTs errors to the ingest-api-error endpoint for triage via the feedback system.
 * Best-effort — never throws, never blocks the caller.
 */

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
  try {
    const ingestUrl = Deno.env.get('SUPABASE_URL')! + '/functions/v1/ingest-api-error'
    const secret = Deno.env.get('API_ERROR_SECRET')
    if (!secret) return

    const e = err as Error
    await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Error-Secret': secret,
      },
      body: JSON.stringify({
        service: 'edge-function',
        function_name: functionName,
        message: e?.message ?? String(err),
        stack: e?.stack?.slice(0, 5000),
        status_code: opts.status_code ?? 500,
        endpoint: opts.endpoint,
        metadata: opts.metadata,
      }),
    })
  } catch {
    // best-effort — never break the caller
  }
}

/**
 * Wrap a Deno.serve handler to auto-report unhandled exceptions and 5xx responses.
 */
export function withErrorReporting(
  functionName: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      const resp = await handler(req)
      if (resp.status >= 500) {
        const body = await resp.clone().text().catch(() => '')
        reportApiError(functionName, new Error(`${resp.status}: ${body.slice(0, 500)}`), {
          status_code: resp.status,
          endpoint: new URL(req.url).pathname,
        })
      }
      return resp
    } catch (err) {
      reportApiError(functionName, err, {
        endpoint: new URL(req.url).pathname,
      })
      throw err
    }
  }
}
