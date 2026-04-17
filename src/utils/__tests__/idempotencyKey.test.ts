import { describe, it, expect } from 'vitest';

// Mirror of supabase/functions/_shared/idempotency.ts so we can test the
// hashing contract from a node environment (the edge function uses the
// SubtleCrypto API which works identically here).
async function sha1Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeIdempotencyKey(
  sourceName: string | null | undefined,
  sourceEntityId: string | null | undefined,
  payloadHash: string | null | undefined,
  fallback: string,
): Promise<string> {
  const sn = sourceName ?? 'unknown';
  const sid = (sourceEntityId ?? '').trim();
  const seed = sid || payloadHash || fallback;
  return sha1Hex(`${sn}:${seed}`);
}

describe('computeIdempotencyKey (mirrors compute_staging_idempotency_key SQL fn)', () => {
  it('is deterministic — same inputs yield same key', async () => {
    const a = await computeIdempotencyKey('foursquare', 'fsq-123', 'hash-xyz', 'fb');
    const b = await computeIdempotencyKey('foursquare', 'fsq-123', 'hash-xyz', 'fb');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });

  it('differs when source_name differs', async () => {
    const a = await computeIdempotencyKey('foursquare', 'fsq-123', null, 'fb');
    const b = await computeIdempotencyKey('gaycities',  'fsq-123', null, 'fb');
    expect(a).not.toBe(b);
  });

  it('differs when source_entity_id differs', async () => {
    const a = await computeIdempotencyKey('foursquare', 'fsq-1', null, 'fb');
    const b = await computeIdempotencyKey('foursquare', 'fsq-2', null, 'fb');
    expect(a).not.toBe(b);
  });

  it('uses payload_hash when source_entity_id is empty', async () => {
    const a = await computeIdempotencyKey('rss', '',   'hash-A', 'fallback-id');
    const b = await computeIdempotencyKey('rss', null, 'hash-A', 'fallback-id');
    expect(a).toBe(b);
  });

  it('uses fallback when both source_entity_id and payload_hash are missing', async () => {
    const a = await computeIdempotencyKey('rss', '', '', 'uuid-1');
    const b = await computeIdempotencyKey('rss', '', '', 'uuid-2');
    expect(a).not.toBe(b);
  });

  it('treats null source_name as "unknown"', async () => {
    const a = await computeIdempotencyKey(null,        'sid', null, 'fb');
    const b = await computeIdempotencyKey('unknown',   'sid', null, 'fb');
    expect(a).toBe(b);
  });

  it('trims whitespace from source_entity_id', async () => {
    const a = await computeIdempotencyKey('rss', '  abc  ', null, 'fb');
    const b = await computeIdempotencyKey('rss', 'abc',     null, 'fb');
    expect(a).toBe(b);
  });
});
