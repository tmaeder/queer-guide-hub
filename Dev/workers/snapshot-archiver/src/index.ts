/**
 * Snapshot Archiver Worker
 *
 * Drains scraper_snapshots older than 30 days from Postgres to R2.
 * Loop:
 *   1. Query `scraper_snapshots_archive_candidates` (view from migration 007)
 *   2. Stream the gzip body to R2 at key `scraper-snapshots/<source>/<year>/<id>.gz`
 *   3. Call `scraper_mark_snapshot_archived(id, r2_key)` which nulls out the
 *      body columns and sets `archived_at + r2_key`.
 *
 * Invocation:
 *   - Scheduled trigger (cron) via `wrangler triggers`
 *   - Manual `POST /` with optional `{ limit }` for backfill / ops use
 *
 * Safety:
 *   - Bounded per invocation (default 500 rows)
 *   - Each row committed individually — a single failure doesn't block the batch
 *   - Idempotent: `scraper_mark_snapshot_archived` is a no-op if already archived
 */

export interface Env {
  /** Supabase project's postgres REST endpoint (PostgREST). */
  SUPABASE_URL: string;
  /** Service role key — write access to scraper_snapshots + RPC. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** R2 bucket binding. */
  SNAPSHOT_BUCKET: R2Bucket;
  /** Optional override — default 500. */
  BATCH_LIMIT?: string;
  /** Optional shared secret for manual invocation. */
  ADMIN_SECRET?: string;
}

interface Candidate {
  id: string;
  source_name: string;
  url: string;
  content_type: string;
  content_hash: string;
  fetched_at: string;
  gz_bytes: number;
}

async function fetchCandidates(env: Env, limit: number): Promise<Candidate[]> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/scraper_snapshots_archive_candidates?select=*&limit=${limit}`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!res.ok) throw new Error(`Supabase candidates: ${res.status} ${await res.text()}`);
  return (await res.json()) as Candidate[];
}

async function fetchBody(env: Env, id: string): Promise<ArrayBuffer | null> {
  // PostgREST returns bytea as base64 by default. Query with
  // `select=content_gz` returns `\x...` hex or base64 depending on server
  // config; easiest path is an RPC that returns a byte payload.
  // We use a lightweight RPC defined alongside the archiver in migration 007.
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/scraper_snapshot_body`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_id: id }),
    },
  );
  if (!res.ok) {
    console.error('body fetch failed', id, res.status, await res.text());
    return null;
  }
  // The RPC returns a bytea-as-base64 string in the response body (JSON-quoted).
  const b64 = (await res.json()) as string | null;
  if (!b64) return null;
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return bin.buffer;
}

async function markArchived(env: Env, id: string, r2Key: string): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/scraper_mark_snapshot_archived`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_id: id, p_r2_key: r2Key }),
  });
  if (!res.ok) throw new Error(`mark_archived ${id}: ${res.status} ${await res.text()}`);
}

function r2KeyFor(c: Candidate): string {
  const year = new Date(c.fetched_at).getUTCFullYear();
  // `id` is a UUID — safe in an object key.
  return `scraper-snapshots/${c.source_name}/${year}/${c.id}.gz`;
}

export interface ArchiveResult {
  considered: number;
  archived: number;
  failed: number;
  skipped_empty: number;
  bytes_moved: number;
}

async function runArchive(env: Env, limit: number): Promise<ArchiveResult> {
  const result: ArchiveResult = { considered: 0, archived: 0, failed: 0, skipped_empty: 0, bytes_moved: 0 };
  const candidates = await fetchCandidates(env, limit);
  result.considered = candidates.length;
  if (candidates.length === 0) return result;

  for (const c of candidates) {
    try {
      const body = await fetchBody(env, c.id);
      if (!body || body.byteLength === 0) {
        result.skipped_empty++;
        continue;
      }
      const key = r2KeyFor(c);
      await env.SNAPSHOT_BUCKET.put(key, body, {
        httpMetadata: { contentType: 'application/gzip' },
        customMetadata: {
          source_name: c.source_name,
          url: c.url,
          content_hash: c.content_hash,
          fetched_at: c.fetched_at,
        },
      });
      await markArchived(env, c.id, key);
      result.archived++;
      result.bytes_moved += body.byteLength;
    } catch (err) {
      result.failed++;
      console.error('archive', c.id, (err as Error).message);
    }
  }
  return result;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const limit = parseInt(env.BATCH_LIMIT ?? '500', 10);
    ctx.waitUntil(
      runArchive(env, limit).then((r) =>
        console.log('snapshot-archiver run', JSON.stringify(r)),
      ),
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'POST') {
      return new Response('POST only', { status: 405 });
    }
    // Optional shared-secret gate for manual invocation.
    if (env.ADMIN_SECRET) {
      const got = req.headers.get('x-admin-secret');
      if (got !== env.ADMIN_SECRET) return new Response('forbidden', { status: 403 });
    }
    const body = await req.json().catch(() => ({})) as { limit?: number };
    const limit = Math.max(1, Math.min(5000, body.limit ?? parseInt(env.BATCH_LIMIT ?? '500', 10)));
    const result = await runArchive(env, limit);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
