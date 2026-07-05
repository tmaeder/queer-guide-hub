/**
 * Drive gaycities-staged event rows through the pipeline via the Supabase
 * Management API (keychain CLI token) — for operator machines without
 * SUPABASE_DB_URL / service key.
 *
 * Loop: pipeline-validate + pipeline-deduplicate + pipeline-review-gate are
 * fired through SQL `net.http_post` (async; the functions self-gate on the
 * vault internal secret), then `commit_event_staging_batch` runs as direct
 * SQL (synchronous) in throttled batches — every events INSERT fans out
 * triggers (pgmq geo-link + embeddings + search sync), so commits are
 * deliberately slow-walked.
 *
 * Usage: npx tsx scripts/gaycities-drain-mgmt.ts [--max-commits N]
 *        [--commit-batch 150] [--sleep 20] [--rounds 200]
 */
import { execFileSync } from 'node:child_process';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

function argNum(flag: string, dflt: number): number {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}
const MAX_COMMITS = argNum('--max-commits', Infinity);
const COMMIT_BATCH = argNum('--commit-batch', 150);
const SLEEP_S = argNum('--sleep', 20);
const MAX_ROUNDS = argNum('--rounds', 400);

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

function mgmtToken(): string {
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim();
  const token = raw.startsWith('go-keyring-base64:')
    ? Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString('utf8').trim()
    : raw;
  if (!token.startsWith('sbp_')) throw new Error('unexpected token format');
  return token;
}
const TOKEN = mgmtToken();

async function runSql<T = unknown>(query: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
      body: JSON.stringify({ query }),
    });
    const text = await res.text();
    if (res.ok) return (text ? JSON.parse(text) : null) as T;
    if (attempt >= 3) throw new Error(`mgmt_sql_${res.status}: ${text.slice(0, 200)}`);
    await sleep(10 * (attempt + 1));
  }
}

function fireStage(fn: string, body: Record<string, unknown>): Promise<unknown> {
  return runSql(`
    SELECT net.http_post(
      url := 'https://${PROJECT}.supabase.co/functions/v1/${fn}',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ${ANON}',
        'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
      ),
      body := '${JSON.stringify(body).replace(/'/g, "''")}'::jsonb,
      timeout_milliseconds := 150000
    ) AS request_id;`);
}

interface Counts {
  pending_validate: number;
  awaiting_dedup: number;
  awaiting_review: number;
  committable: number;
}

async function counts(): Promise<Counts> {
  const rows = await runSql<Counts[]>(`
    SELECT
      count(*) FILTER (WHERE ai_validation_status='pending' AND normalized_data IS NOT NULL)::int AS pending_validate,
      count(*) FILTER (WHERE ai_validation_status='approved' AND dedup_status='pending' AND disposition='pending')::int AS awaiting_dedup,
      count(*) FILTER (WHERE ai_validation_status='approved' AND review_status IN ('auto','pending_review') AND disposition='pending')::int AS awaiting_review,
      count(*) FILTER (WHERE disposition IN ('pending','approved') AND ai_validation_status='approved'
                        AND (dedup_status IN ('unique','duplicate','merge_candidate') OR dedup_status IS NULL)
                        AND (review_status IN ('auto','approved') OR review_status IS NULL))::int AS committable
    FROM ingestion_staging WHERE entity_type='event';`);
  return rows[0];
}

async function main(): Promise<void> {
  let committed = 0;
  for (let round = 0; round < MAX_ROUNDS && committed < MAX_COMMITS; round++) {
    const c = await counts();
    log(`round ${round}: ${JSON.stringify(c)} committed=${committed}`);
    if (c.pending_validate === 0 && c.awaiting_dedup === 0 && c.awaiting_review === 0 && c.committable === 0) {
      log('queue fully drained');
      break;
    }
    if (c.pending_validate > 0) await fireStage('pipeline-validate', { entityType: 'event', batch_size: 1500, warn_review_threshold: 6 });
    if (c.awaiting_dedup > 0) await fireStage('pipeline-deduplicate', { entityType: 'event', batch_size: 1000 });
    // Backfill of already-public event listings: bypass the human review queue.
    // review-gate scores combinedScore = confidence*0.6 + quality_score/100*0.4
    // and floors at minConfidence(0.7); without a quality-score stage that caps
    // at 0.6, so every row would land in pending_review. autoApproveAbove:0 makes
    // every non-force-reviewed row auto-approve (gaycities has no source_reliability
    // row, so lowReliability never fires). Ongoing weekly rows get real scoring via
    // the ev-drain-quality cron.
    if (c.awaiting_review > 0)
      await fireStage('pipeline-review-gate', {
        entityType: 'event',
        batch_size: 1500,
        autoApproveAbove: 0,
        minConfidence: 0,
      });
    if (c.committable > 0) {
      const limit = Math.min(COMMIT_BATCH, MAX_COMMITS - committed);
      const res = await runSql<Array<{ action: string; n: number }>>(
        `SELECT action, count(*)::int AS n FROM public.commit_event_staging_batch(${limit}) GROUP BY 1;`,
      );
      const total = res.reduce((s, r) => s + r.n, 0);
      committed += total;
      log(`commit: ${JSON.stringify(res)} (total ${committed})`);
    }
    await sleep(SLEEP_S);
  }
  const final = await runSql(`
    SELECT count(*)::int AS n, min(start_date)::date AS min, max(start_date)::date AS max
    FROM events WHERE data_source='gaycities';`);
  log('events from gaycities: ' + JSON.stringify(final));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
