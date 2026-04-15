import { describe, it, expect } from 'vitest';

// Mirrors public.news_compute_fingerprint (after migration
// 20260415170400_news_fingerprint_hardening.sql). Tests the invariant that
// the function NEVER returns NULL — previously short-title / no-source rows
// bypassed the unique fingerprint index and leaked as duplicates.
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeTitle(title: string | null | undefined): string {
  return (title ?? '').toLowerCase().replace(/[^a-z0-9]+/gi, '');
}

function normalizeUrl(url: string | null | undefined): string {
  return (url ?? '').toLowerCase().replace(/[#?].*$/, '');
}

function dayOf(ts: Date | string | null | undefined): string {
  const d = ts ? new Date(ts) : new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function computeFingerprint(
  title: string | null,
  publishedAt: Date | string | null,
  sourceId: string | null,
  url: string | null = null,
): Promise<string> {
  const titleNorm = normalizeTitle(title);
  const urlNorm = normalizeUrl(url);
  const day = dayOf(publishedAt);
  const src = sourceId ?? 'no-source';

  if (titleNorm.length >= 8 && sourceId != null) {
    return sha256Hex(`${src}:${titleNorm}:${day}`);
  }
  if (urlNorm.length > 0) {
    return sha256Hex(`${src}:url:${urlNorm}:${day}`);
  }
  if (titleNorm.length > 0) {
    return sha256Hex(`${src}:short:${titleNorm}:${day}`);
  }
  return sha256Hex(`${src}:none:${day}`);
}

const SID = '11111111-1111-1111-1111-111111111111';
const TS = '2026-01-15T12:00:00Z';

describe('news_compute_fingerprint (hardened — never NULL)', () => {
  it('primary path: long title + source_id produces stable fingerprint', async () => {
    const a = await computeFingerprint('LGBTQ Pride Parade in Berlin 2026', TS, SID);
    const b = await computeFingerprint('LGBTQ Pride Parade in Berlin 2026', TS, SID);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to URL when title is short', async () => {
    const fp = await computeFingerprint('Pride!', TS, SID, 'https://news.example/pride-2026');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    // Different URL → different fp
    const fp2 = await computeFingerprint('Pride!', TS, SID, 'https://news.example/other-url');
    expect(fp).not.toBe(fp2);
  });

  it('falls back to URL when source_id is null', async () => {
    const fp = await computeFingerprint('An important breaking story', TS, null, 'https://news.example/a');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to short-title when URL empty', async () => {
    const fp = await computeFingerprint('Hi!', TS, SID, null);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('worst-case: no title AND no URL — still non-null', async () => {
    const fp = await computeFingerprint(null, TS, SID, null);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    // Worst-case collisions are OK — caller must dedup by duplicate_of_id.
    const fp2 = await computeFingerprint('', TS, SID, '');
    expect(fp2).toBe(fp);
  });

  it('null inputs across the board still yield a fingerprint', async () => {
    const fp = await computeFingerprint(null, null, null, null);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp.length).toBe(64);
  });

  it('day granularity: same article 1h apart → same fp', async () => {
    const a = await computeFingerprint('Pride Parade Berlin 2026', '2026-01-15T08:00:00Z', SID);
    const b = await computeFingerprint('Pride Parade Berlin 2026', '2026-01-15T20:00:00Z', SID);
    expect(a).toBe(b);
  });

  it('day granularity: next day → different fp (defensive)', async () => {
    const a = await computeFingerprint('Pride Parade Berlin 2026', '2026-01-15T23:00:00Z', SID);
    const b = await computeFingerprint('Pride Parade Berlin 2026', '2026-01-16T01:00:00Z', SID);
    expect(a).not.toBe(b);
  });

  it('title normalization: punctuation and case do not change fp', async () => {
    const a = await computeFingerprint('LGBTQ Pride: Berlin 2026!', TS, SID);
    const b = await computeFingerprint('lgbtq pride berlin 2026', TS, SID);
    expect(a).toBe(b);
  });

  it('different source_ids → different fps even for same title', async () => {
    const a = await computeFingerprint('Pride Parade Berlin 2026', TS, SID);
    const b = await computeFingerprint('Pride Parade Berlin 2026', TS, '22222222-2222-2222-2222-222222222222');
    expect(a).not.toBe(b);
  });
});
