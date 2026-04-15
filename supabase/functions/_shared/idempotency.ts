// ============================================================
// Idempotency key helpers (matches public.compute_staging_idempotency_key)
// ============================================================

async function sha1Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Deterministic key derived from (source_name, source_entity_id || payload_hash || fallback).
 * MUST mirror the SQL function compute_staging_idempotency_key so triggers and
 * application code agree on the same key.
 */
export async function computeIdempotencyKey(
  sourceName: string | null | undefined,
  sourceEntityId: string | null | undefined,
  payloadHash: string | null | undefined,
  fallback: string,
): Promise<string> {
  const sn = sourceName ?? 'unknown'
  const sid = (sourceEntityId ?? '').trim()
  const seed = sid || payloadHash || fallback
  return sha1Hex(`${sn}:${seed}`)
}
