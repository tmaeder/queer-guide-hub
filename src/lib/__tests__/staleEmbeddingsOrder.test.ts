import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `get_stale_embeddings` is the work list for the only path that writes a
 * vector into content_embeddings (workers/ingest), which feeds
 * search_embeddings — the vector arm of search_hybrid.
 *
 * It shipped with `ORDER BY updated_at DESC`, i.e. newest dirty row first. That
 * is a LIFO peek, not a queue: under continuous churn (news re-sanitize runs
 * every 5 minutes, the nightly backfills rewrite 300-1500 rows a pass) the tail
 * is never reached at all, so a backlog does not drain slowly — it never
 * drains. Measured 2026-08-23: 6,209 active marketplace_listings with a missing
 * or stale embedding, freshly imported rows sitting as deep as position ~2,900,
 * keyword-searchable and vector-invisible.
 *
 * The ordering is therefore load-bearing and cheap to revert by accident (it is
 * one word in a CREATE OR REPLACE). This is a text check against the migrations
 * directory so it runs in CI without credentials — same pattern as
 * `citySafetyBackfill.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    // `create [or replace] function`, not merely `function`: a GRANT, REVOKE,
    // COMMENT ON, DROP or ALTER naming the function also contains
    // "function public.<fn>(" and would otherwise win the reverse scan.
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

/**
 * The dollar-quoted body only, with `--` comments stripped. Both matter: the
 * migration's own header prose quotes the ORDER BY it is replacing, and an
 * explanatory comment inside the body would otherwise satisfy assertions the
 * SQL itself no longer does.
 */
function bodyOf(fn: string): string {
  const file = latestDefinitionOf(fn);
  const at = file.search(
    new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i'),
  );
  const rest = file.slice(at);
  const open = rest.indexOf('$function$');
  const close = rest.indexOf('$function$', open + 10);
  if (open < 0 || close < 0) throw new Error(`${fn}: no dollar-quoted body`);
  return rest.slice(open + 10, close).replace(/--[^\n]*/g, '');
}

const sql = bodyOf('get_stale_embeddings');

const orderBy = (() => {
  const m = sql.match(/ORDER\s+BY([\s\S]*?)LIMIT/i);
  return m ? m[1] : '';
})();

describe('get_stale_embeddings is a FIFO queue', () => {
  it('has an ORDER BY at all', () => {
    expect(orderBy.trim()).not.toBe('');
  });

  it('serves rows with no vector before rows that merely drifted', () => {
    // A missing vector is invisibility in semantic search; a stale one is only
    // drift. Never-embedded rows have to come first.
    expect(orderBy).toMatch(/embedding\s+IS\s+NULL\)\s*DESC/i);
  });

  it('orders the work oldest-dirty-first, never newest-first', () => {
    expect(orderBy).toMatch(/updated_at\s+ASC/i);
    expect(orderBy).not.toMatch(/updated_at\s+DESC/i);
  });

  it('does not let rows with a null updated_at own the head of the queue', () => {
    expect(orderBy).toMatch(/updated_at\s+ASC\s+NULLS\s+LAST/i);
  });
});

describe('the health sentinel measures what the drain selects', () => {
  const backlog = bodyOf('get_stale_embedding_backlog');

  it('both read the same candidate set', () => {
    // A sentinel counting a slightly different set than the worker drains is
    // how a starving queue reads clean. They share one view for that reason.
    expect(sql).toMatch(/FROM\s+embedding_candidates/i);
    expect(backlog).toMatch(/FROM\s+embedding_candidates/i);
  });

  it('both apply the same dirty predicate', () => {
    const dirty = /ce\.embedding\s+IS\s+NULL\s+OR\s+ce\.updated_at\s*<\s*cand\.updated_at/i;
    expect(sql).toMatch(dirty);
    expect(backlog).toMatch(dirty);
  });

  it('reports a liveness timestamp, not only a depth', () => {
    // Depth cannot decide this in either direction — a healthy drain working
    // through an import is legitimately deep, a dead one on a quiet day never
    // is. workers/ingest is the sole writer of content_embeddings, so the
    // newest row there is the last time the drain did any work.
    expect(backlog).toMatch(/'last_embedded_at'/);
  });
});
