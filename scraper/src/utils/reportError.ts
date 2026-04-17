/**
 * Report errors to the API error ingest endpoint for triage via feedback system.
 * Best-effort — never throws, never blocks the caller.
 */

const INGEST_URL = process.env.API_ERROR_INGEST_URL;
const INGEST_SECRET = process.env.API_ERROR_SECRET;

export async function reportError(
  functionName: string,
  err: unknown,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    if (!INGEST_URL || !INGEST_SECRET) return;

    const e = err as Error;
    await fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Error-Secret': INGEST_SECRET,
      },
      body: JSON.stringify({
        service: 'scraper',
        function_name: functionName,
        message: e?.message ?? String(err),
        stack: e?.stack?.slice(0, 5000),
        status_code: 500,
        metadata,
      }),
    });
  } catch {
    // best-effort — never break the caller
  }
}
