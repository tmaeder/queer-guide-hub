/**
 * Drive gaycities-staged event rows through the pipeline stages, throttled.
 *
 * Rows are staged pre-normalized (normalized_data set), so the path is
 * validate → deduplicate → review-gate → commit_event_staging_batch.
 * Stage functions run in "drain mode" (no pipeline_run_id → global pick-up);
 * commit goes straight to SQL so batch size + sleep are controllable — every
 * events INSERT fans out triggers (pgmq geo-link + embeddings + search sync),
 * so commits are deliberately slow-walked.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
 * Usage: npx tsx scripts/gaycities-drain.ts [--max-commits 500] [--commit-batch 150] [--sleep 20]
 */
import 'dotenv/config';
import { Pool } from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.PUBLISH_DB_URL;

function argNum(flag: string, dflt: number): number {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}

const MAX_COMMITS = argNum('--max-commits', Infinity);
const COMMIT_BATCH = argNum('--commit-batch', 150);
const SLEEP_S = argNum('--sleep', 20);

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

async function callStage(fn: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

/** Loop a stage function until it reports zero items picked up. */
async function drainStage(fn: string, body: Record<string, unknown>, label: string): Promise<void> {
  for (let i = 0; ; i++) {
    const out = await callStage(fn, body);
    const items = Number(out.items ?? out.processed ?? 0);
    log(`${label} tick ${i}: ${JSON.stringify(out).slice(0, 300)}`);
    if (items === 0) return;
    await sleep(2);
  }
}

async function main(): Promise<void> {
  if (!DB_URL) throw new Error('SUPABASE_DB_URL not set');
  const pool = new Pool({ connectionString: DB_URL, max: 2 });

  const counts = async () => {
    const r = await pool.query(
      `SELECT disposition, ai_validation_status, dedup_status, review_status, count(*)::int AS n
       FROM ingestion_staging WHERE source_name='gaycities' AND target_table='events'
       GROUP BY 1,2,3,4 ORDER BY n DESC`,
    );
    return r.rows as Array<Record<string, unknown>>;
  };

  try {
    log('staging state before: ' + JSON.stringify(await counts()));

    await drainStage('pipeline-validate', { entityType: 'event', batch_size: 200, warn_review_threshold: 6 }, 'validate');
    await drainStage('pipeline-deduplicate', { entityType: 'event', batch_size: 100 }, 'dedupe');
    await drainStage('pipeline-review-gate', { entityType: 'event', batch_size: 200 }, 'review-gate');

    let committed = 0;
    for (let tick = 0; committed < MAX_COMMITS; tick++) {
      const limit = Math.min(COMMIT_BATCH, MAX_COMMITS - committed);
      const res = await pool.query('SELECT action, count(*)::int AS n FROM commit_event_staging_batch($1) GROUP BY 1', [limit]);
      const total = res.rows.reduce((s: number, r: { n: number }) => s + r.n, 0);
      committed += total;
      log(`commit tick ${tick}: ${JSON.stringify(res.rows)} (total ${committed})`);
      if (total === 0) break;
      await sleep(SLEEP_S);
    }

    log('staging state after: ' + JSON.stringify(await counts()));
    const evs = await pool.query(
      `SELECT count(*)::int AS n, min(start_date)::date AS min, max(start_date)::date AS max
       FROM events WHERE data_source='gaycities'`,
    );
    log('events from gaycities: ' + JSON.stringify(evs.rows[0]));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
