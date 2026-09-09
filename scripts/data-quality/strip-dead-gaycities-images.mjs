#!/usr/bin/env node
/**
 * Drain the dead gaycities S3 image urls out of events.images.
 *
 * 27,494 rows at 300 per call (~92 rounds), or 27,194 / ~91 rounds if the
 * migration's one-batch proof (20360902100000) already ran. This is a script
 * and not a loop inside the migration because each RPC call here is its own
 * top-level statement, so the 2-minute cluster-default `statement_timeout`
 * applies PER BATCH rather than to the whole ~27k-row job. A PL/pgSQL function
 * cannot raise its own statement_timeout — the timer arms when the top-level
 * statement starts, not per internal loop iteration — and a timeout is a full
 * rollback, so draining the whole backlog inside one function call would risk
 * losing all of it at once instead of simply pausing between batches.
 *
 * Interruptible and resumable by construction: run_event_dead_image_strip has
 * no cursor column, the predicate ("images contains a dead url") IS the work
 * list, so stopping the script just leaves the rest for the next run.
 *
 *   node scripts/data-quality/strip-dead-gaycities-images.mjs --dry-run
 *   node scripts/data-quality/strip-dead-gaycities-images.mjs
 *
 * Auth: Supabase Management API via the macOS-keychain CLI token (house
 *   pattern, same as backfill-venue-postal.mjs; set SUPABASE_PAT to override).
 *
 * Retries: transient 5xx/429 from the Management API are retried with backoff.
 *   This is safe specifically BECAUSE the predicate is the work list — a batch
 *   that partially applied before the response was lost simply shrinks the set
 *   the next call selects from; there is no cursor to desynchronize and no risk
 *   of double-applying a row (the filtered rebuild is idempotent once a row no
 *   longer matches the predicate, it is never touched again).
 *
 * Pacing: 250ms between batches. Not rate-limiting the Management API — each
 *   write enqueues up to 300 rows into search_reindex_queue (events' search
 *   sync trigger is unscoped, so every UPDATE reindexes), which drains at
 *   1000/min. The whole run adds ~27.5k rows there and the pause keeps that
 *   inflow from spiking far past the drain rate while the script itself runs
 *   in well under a minute of DB time.
 */

import { execFileSync } from 'node:child_process';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const BATCH = 300;
const INTERVAL_MS = 250;
const PROGRESS_EVERY = 10;
// 27,494 / 300 ≈ 92 rounds. 200 is a backstop far above that, not a target —
// hitting it means something is wrong (see the stalled check below), not that
// the job is merely slow.
const MAX_ROUNDS = 200;

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}
const TOKEN = token();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Retries transient failures (5xx, 429) with exponential backoff. A 4xx other
 * than 429 is our own bad SQL/auth and must surface immediately, not be
 * retried into a longer, more confusing failure.
 */
async function sql(query, attempt = 0) {
  let res;
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
  } catch (e) {
    if (attempt >= 5) throw e;
    console.error(`  network error (${e.message}), retry ${attempt + 1}/5`);
    await sleep(2000 * 2 ** attempt);
    return sql(query, attempt + 1);
  }
  if (res.ok) return res.json();
  const body = (await res.text()).slice(0, 300);
  if ((res.status >= 500 || res.status === 429) && attempt < 5) {
    console.error(`  mgmt API ${res.status}, retry ${attempt + 1}/5`);
    await sleep(2000 * 2 ** attempt);
    return sql(query, attempt + 1);
  }
  throw new Error(`mgmt API ${res.status}: ${body}`);
}

const REMAINING = `select count(*)::int as n from public.events
  where exists (select 1 from unnest(images) i
                 where i like '%gaycities-featured-images-production.s3%')`;

const start = Date.now();
let [{ n: remaining }] = await sql(REMAINING);
console.log(`backlog: ${remaining}`);

if (DRY) {
  console.log('--dry-run: no writes. Run without the flag to drain.');
  process.exit(0);
}

let rounds = 0;
let totalUpdated = 0;
let totalEmptied = 0;
let mixedRounds = 0;

while (remaining > 0 && rounds < MAX_ROUNDS) {
  const [row] = await sql(`select public.run_event_dead_image_strip(${BATCH}) as r`);
  const r = typeof row.r === 'string' ? JSON.parse(row.r) : row.r;

  // A round that matches rows but updates none would otherwise spin silently
  // to MAX_ROUNDS. Throw immediately and say so — this is the sign the
  // predicate stopped moving (e.g. a permissions change, a schema drift).
  if (r.updated === 0 && r.remaining > 0) {
    throw new Error(
      `stalled: round ${rounds + 1} matched a backlog of ${r.remaining} but updated 0 rows`,
    );
  }

  // updated === emptied for every row today, because every affected row holds
  // exactly one element (the dead url). They diverge only when a MIXED array
  // shows up — a row with a dead url alongside a surviving image. The filtered
  // rebuild in the RPC handles that correctly (it keeps the survivor), so this
  // is not an error condition — just something the original measurement never
  // saw, and worth surfacing loudly rather than passing through silently.
  if (r.updated !== r.emptied) {
    mixedRounds += 1;
    console.warn(
      `⚠ round ${rounds + 1}: updated ${r.updated} but only ${r.emptied} went empty — ` +
        `${r.updated - r.emptied} row(s) had a MIXED array (dead url + a survivor). ` +
        `The corpus gained a shape the original measurement did not contain.`,
    );
  }

  totalUpdated += r.updated;
  totalEmptied += r.emptied;
  rounds += 1;
  remaining = r.remaining;

  if (rounds % PROGRESS_EVERY === 0 || remaining === 0) {
    console.log(`  round ${rounds}: updated ${totalUpdated}, remaining ${remaining}`);
  }
  if (remaining > 0) await sleep(INTERVAL_MS);
}

const secs = Math.round((Date.now() - start) / 1000);
console.log(
  `done: ${totalUpdated} rows updated (${totalEmptied} emptied) in ${rounds} rounds, ` +
    `${secs}s, remaining ${remaining}`,
);
if (mixedRounds > 0) {
  console.warn(`⚠ ${mixedRounds} round(s) contained a mixed array — see warnings above`);
}

if (remaining > 0) {
  console.error(`✗ hit MAX_ROUNDS (${MAX_ROUNDS}) with ${remaining} left — re-run to continue`);
  process.exit(1);
}

const [q] = await sql(`select count(*)::int as n from public.search_reindex_queue`);
console.log(`search_reindex_queue depth now ${q.n}; drains at 1000/min`);
