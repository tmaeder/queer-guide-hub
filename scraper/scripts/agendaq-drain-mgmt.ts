/**
 * Drain the scoped AgendaQ remediation run through the production pipeline.
 *
 * Stage functions are invoked synchronously with the internal vault secret.
 * Commits call the per-item RPCs so no unrelated source can be advanced.
 *
 * Usage: npx tsx scripts/agendaq-drain-mgmt.ts [--rounds 600] [--sleep 15]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const RUN_ID = 'a6e0da00-2026-1006-8000-000000000001';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

function argNum(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

const MAX_ROUNDS = argNum('--rounds', 600);
const SLEEP_SECONDS = argNum('--sleep', 15);
const COMMIT_BATCH = argNum('--commit-batch', 500);
const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1_000));

function managementToken(): string {
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  const token = raw.startsWith('go-keyring-base64:')
    ? Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString('utf8').trim()
    : raw;
  if (!token.startsWith('sbp_')) throw new Error('Unexpected Supabase CLI token format');
  return token;
}

const token = managementToken();

async function sql<T = unknown>(query: string, attempt = 0): Promise<T> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'Queer Guide AgendaQ pipeline drain',
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  if (response.ok) return (text ? JSON.parse(text) : null) as T;
  if (attempt >= 3) throw new Error(`Management API ${response.status}: ${text.slice(0, 500)}`);
  await sleep(5 * (attempt + 1));
  return sql<T>(query, attempt + 1);
}

let internalSecret: string | null = null;

async function getInternalSecret(): Promise<string> {
  if (internalSecret) return internalSecret;
  const rows = await sql<Array<{ decrypted_secret: string }>>(`
    SELECT decrypted_secret FROM vault.decrypted_secrets
    WHERE name='internal_invoke_secret' LIMIT 1;`);
  internalSecret = rows[0]?.decrypted_secret ?? null;
  if (!internalSecret) throw new Error('internal_invoke_secret is unavailable');
  return internalSecret;
}

async function fireStage(name: string, body: Record<string, unknown>): Promise<void> {
  const secret = await getInternalSecret();
  const response = await fetch(`https://${PROJECT}.supabase.co/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ANON}`,
      'content-type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name} ${response.status}: ${text.slice(0, 500)}`);
  const result = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (result.success === false) throw new Error(`${name}: ${text.slice(0, 500)}`);
  console.log(`[agendaq] ${name}: ${text.slice(0, 500)}`);
}

interface Counts {
  pending_validate: number;
  awaiting_dedup: number;
  awaiting_review: number;
  committable: number;
  rejected: number;
  needs_review: number;
}

async function counts(target: 'events' | 'venues'): Promise<Counts> {
  const rows = await sql<Counts[]>(`
    SELECT
      count(*) FILTER (
        WHERE disposition='pending' AND ai_validation_status='pending'
      )::int AS pending_validate,
      count(*) FILTER (
        WHERE disposition='pending' AND ai_validation_status='approved'
          AND dedup_status='pending'
      )::int AS awaiting_dedup,
      count(*) FILTER (
        WHERE disposition='pending' AND ai_validation_status='approved'
          AND dedup_status IN ('unique','duplicate','merge_candidate')
          AND review_status IN ('auto','pending_review')
      )::int AS awaiting_review,
      count(*) FILTER (
        WHERE disposition='pending' AND ai_validation_status='approved'
          AND dedup_status IN ('unique','duplicate','merge_candidate')
          AND review_status IN ('auto','approved')
      )::int AS committable,
      count(*) FILTER (WHERE disposition='rejected')::int AS rejected,
      count(*) FILTER (
        WHERE disposition='pending' AND ai_validation_status='needs_review'
      )::int AS needs_review
    FROM public.ingestion_staging
    WHERE source_name='agendaq' AND target_table='${target}';`);
  return rows[0];
}

async function commitItems(target: 'events' | 'venues', limit: number): Promise<void> {
  const entity = target === 'events' ? 'event' : 'venue';
  await sql(`
    DO $agendaq_commit$
    DECLARE item record;
    BEGIN
      FOR item IN
        SELECT id
        FROM public.ingestion_staging
        WHERE source_name='agendaq'
          AND target_table='${target}'
          AND disposition='pending'
          AND ai_validation_status='approved'
          AND dedup_status IN ('unique','duplicate','merge_candidate')
          AND review_status IN ('auto','approved')
        ORDER BY created_at, id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      LOOP
        BEGIN
          PERFORM public.commit_${entity}_staging_item(item.id, 'agendaq-remediation');
        EXCEPTION WHEN OTHERS THEN
          UPDATE public.ingestion_staging
          SET disposition='rejected', error_message='commit_fn: ' || SQLERRM, updated_at=now()
          WHERE id=item.id;
        END;
      END LOOP;
    END
    $agendaq_commit$;`);
}

async function dedupeVenues(limit: number): Promise<void> {
  const rows = await sql<Array<{ decision: string; n: number }>>(`
    WITH batch AS (
      SELECT id, normalized_data
      FROM public.ingestion_staging
      WHERE source_name='agendaq'
        AND target_table='venues'
        AND pipeline_run_id='${RUN_ID}'::uuid
        AND disposition='pending'
        AND ai_validation_status='approved'
        AND dedup_status='pending'
      ORDER BY created_at, id
      LIMIT ${limit}
    ), candidates AS (
      SELECT b.id AS staging_id,
             v.id AS venue_id,
             CASE
               WHEN b.normalized_data->'location'->>'address' IS NOT NULL
                 AND v.address_normalized = public.normalize_address(
                   b.normalized_data->'location'->>'address'
                 ) THEN 'address_exact'
               WHEN v.latitude IS NOT NULL
                 AND (b.normalized_data->'location'->>'lat') IS NOT NULL
                 AND public.haversine_m(
                   (b.normalized_data->'location'->>'lat')::numeric,
                   (b.normalized_data->'location'->>'lng')::numeric,
                   v.latitude, v.longitude
                 ) <= 250 THEN 'name_geo_exact'
               ELSE 'despaced_city_text'
             END AS match_type,
             CASE
               WHEN b.normalized_data->'location'->>'address' IS NOT NULL
                 AND v.address_normalized = public.normalize_address(
                   b.normalized_data->'location'->>'address'
                 ) THEN 0.97
               WHEN v.latitude IS NOT NULL
                 AND (b.normalized_data->'location'->>'lat') IS NOT NULL
                 AND public.haversine_m(
                   (b.normalized_data->'location'->>'lat')::numeric,
                   (b.normalized_data->'location'->>'lng')::numeric,
                   v.latitude, v.longitude
                 ) <= 250 THEN 0.96
               ELSE 0.88
             END::numeric AS score,
             public.haversine_m(
               (b.normalized_data->'location'->>'lat')::numeric,
               (b.normalized_data->'location'->>'lng')::numeric,
               v.latitude, v.longitude
             ) AS distance_m,
             row_number() OVER (
               PARTITION BY b.id
               ORDER BY
                 CASE
                   WHEN b.normalized_data->'location'->>'address' IS NOT NULL
                     AND v.address_normalized = public.normalize_address(
                       b.normalized_data->'location'->>'address'
                     ) THEN 0.97
                   WHEN v.latitude IS NOT NULL
                     AND (b.normalized_data->'location'->>'lat') IS NOT NULL
                     AND public.haversine_m(
                       (b.normalized_data->'location'->>'lat')::numeric,
                       (b.normalized_data->'location'->>'lng')::numeric,
                       v.latitude, v.longitude
                     ) <= 250 THEN 0.96
                   ELSE 0.88
                 END DESC,
                 v.id
             ) AS rank
      FROM batch b
      JOIN public.venues v
        ON v.name_normalized = public.normalize_name(b.normalized_data->>'name')
       AND v.duplicate_of_id IS NULL
       AND (
         (
           b.normalized_data->'location'->>'address' IS NOT NULL
           AND v.address_normalized = public.normalize_address(
             b.normalized_data->'location'->>'address'
           )
         )
         OR (
           v.latitude IS NOT NULL
           AND (b.normalized_data->'location'->>'lat') IS NOT NULL
           AND public.haversine_m(
             (b.normalized_data->'location'->>'lat')::numeric,
             (b.normalized_data->'location'->>'lng')::numeric,
             v.latitude, v.longitude
           ) <= 250
         )
         OR (
           nullif(b.normalized_data->'location'->>'city', '') IS NOT NULL
           AND public.dedup_despace(v.city) = public.dedup_despace(
             b.normalized_data->'location'->>'city'
           )
         )
       )
    ), verdicts AS (
      SELECT b.id AS staging_id,
             c.venue_id AS match_id,
             coalesce(c.match_type, 'none') AS match_type,
             coalesce(c.score, 0)::numeric AS score,
             CASE WHEN c.score >= 0.90 THEN 'duplicate'
                  WHEN c.score >= 0.75 THEN 'merge_candidate'
                  ELSE 'unique' END AS decision,
             CASE WHEN c.score >= 0.90 THEN 'auto_merge'
                  WHEN c.score >= 0.75 THEN 'flag_review'
                  ELSE 'no_match' END AS action,
             c.distance_m
      FROM batch b
      LEFT JOIN candidates c ON c.staging_id=b.id AND c.rank=1
    ), journaled AS (
      SELECT v.*,
             public.record_dedup_decision(
               'venue', v.staging_id, '${RUN_ID}'::uuid, v.match_id,
               v.match_type, v.score, v.decision, v.action,
               jsonb_build_object(
                 'signals', CASE WHEN v.match_id IS NULL THEN '[]'::jsonb ELSE
                   jsonb_build_array(jsonb_build_object(
                     'match_type', v.match_type, 'family', 'deterministic', 'score', v.score
                   )) END,
                 'guards_fired', '[]'::jsonb,
                 'semantic_cosine', 0,
                 'distance_m', v.distance_m
               ),
               'agendaq-remediation'
             ) AS recorded
      FROM verdicts v
    ), updated AS (
      UPDATE public.ingestion_staging s
      SET dedup_status=j.decision,
          dedup_match_id=j.match_id,
          dedup_match_table='venues',
          dedup_match_score=j.score,
          dedup_details=jsonb_build_object(
            'match_type', j.match_type,
            'fused_score', j.score,
            'semantic_cosine', 0,
            'distance_m', j.distance_m,
            'source', 'agendaq-deterministic-drain'
          ),
          review_status=CASE WHEN j.decision='merge_candidate' THEN 'pending_review' ELSE 'auto' END,
          updated_at=now()
      FROM journaled j
      WHERE s.id=j.staging_id
      RETURNING s.id, j.*
    ), queued AS (
      INSERT INTO public.review_queue(entity_type, entity_id, review_type, status, details)
      SELECT 'ingestion_staging', id, 'merge_candidate', 'pending',
             jsonb_build_object(
               'target_table', 'venues', 'match_id', match_id,
               'match_type', match_type, 'score', score
             )
      FROM updated WHERE decision='merge_candidate'
      RETURNING 1
    )
    SELECT decision, count(*)::int AS n FROM updated GROUP BY decision ORDER BY decision;`);
  console.log(`[agendaq] venue deterministic dedup: ${JSON.stringify(rows)}`);
}

async function drain(target: 'events' | 'venues'): Promise<void> {
  const entityType = target === 'events' ? 'event' : 'venue';
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const state = await counts(target);
    console.log(`[agendaq] ${target} round ${round}: ${JSON.stringify(state)}`);
    if (
      state.pending_validate === 0 &&
      state.awaiting_dedup === 0 &&
      state.awaiting_review === 0 &&
      state.committable === 0
    ) {
      if (state.rejected > 0) throw new Error(`${target}: ${state.rejected} rejected rows remain`);
      return;
    }
    if (state.pending_validate > 0) {
      await fireStage('pipeline-validate', {
        pipeline_run_id: RUN_ID,
        entityType,
        targetTable: target,
        batch_size: 800,
        warn_review_threshold: 99,
      });
      await sleep(SLEEP_SECONDS);
      continue;
    }
    if (state.awaiting_dedup > 0) {
      if (target === 'venues') {
        await dedupeVenues(Math.min(500, state.awaiting_dedup));
      } else {
        await fireStage('pipeline-deduplicate', {
          pipeline_run_id: RUN_ID,
          entityType,
          targetTable: target,
          batch_size: 300,
          embed_cap: 0,
        });
      }
      await sleep(SLEEP_SECONDS);
      continue;
    }
    if (state.awaiting_review > 0) {
      await fireStage('pipeline-review-gate', {
        pipeline_run_id: RUN_ID,
        entityType,
        batch_size: 500,
        autoApproveAbove: 0,
        minConfidence: 0,
      });
      await sleep(SLEEP_SECONDS);
      continue;
    }
    if (state.committable > 0) {
      await commitItems(target, Math.min(COMMIT_BATCH, state.committable));
      await sleep(2);
    }
  }
  throw new Error(`${target}: exceeded ${MAX_ROUNDS} drain rounds`);
}

async function inspectRejected(): Promise<void> {
  const rows = await sql(`
    SELECT
      target_table,
      ai_validation_result->'errors' AS errors,
      count(*)::int AS count,
      jsonb_agg(jsonb_build_object(
        'id', id,
        'source_entity_id', source_entity_id,
        'start_date', normalized_data->>'start_date',
        'end_date', normalized_data->>'end_date',
        'location', normalized_data->'location'
      ) ORDER BY source_entity_id) FILTER (WHERE true) AS examples
    FROM public.ingestion_staging
    WHERE source_name='agendaq' AND disposition='rejected'
    GROUP BY target_table, ai_validation_result->'errors'
    ORDER BY target_table, count(*) DESC;`);
  console.log(JSON.stringify(rows, null, 2));
}

async function reconcileReviewQueue(): Promise<void> {
  await sql(`
    UPDATE public.review_queue q
    SET status='resolved', resolved_at=coalesce(q.resolved_at, now())
    FROM public.ingestion_staging s
    WHERE q.entity_type='ingestion_staging'
      AND q.entity_id=s.id
      AND q.status='pending'
      AND q.review_type IN ('validate_flag','merge_candidate')
      AND s.source_name='agendaq'
      AND NOT (
        q.review_type='validate_flag'
        AND s.disposition='pending'
        AND s.ai_validation_status='needs_review'
      )
      AND NOT (
        q.review_type='merge_candidate'
        AND s.disposition='pending'
        AND s.review_status='pending_review'
      );`);
  console.log('[agendaq] review queue reconciled');
}

interface AuditRow {
  venue_total: number;
  venue_terminal: number;
  venue_needs_review: number;
  event_total: number;
  event_terminal: number;
  event_needs_review: number;
  rejected: number;
  automation_open: number;
  venue_sources: number;
  event_sources: number;
  review_queue_open: number;
  pipeline_status: string;
  pipeline_items_processed: number;
  pipeline_items_succeeded: number;
  pipeline_items_failed: number;
}

async function audit(): Promise<AuditRow> {
  const rows = await sql<AuditRow[]>(`
    SELECT
      count(*) FILTER (WHERE target_table='venues')::int AS venue_total,
      count(*) FILTER (
        WHERE target_table='venues' AND disposition IN ('inserted','updated')
      )::int AS venue_terminal,
      count(*) FILTER (
        WHERE target_table='venues' AND disposition='pending'
          AND ai_validation_status='needs_review'
      )::int AS venue_needs_review,
      count(*) FILTER (WHERE target_table='events')::int AS event_total,
      count(*) FILTER (
        WHERE target_table='events' AND disposition IN ('inserted','updated')
      )::int AS event_terminal,
      count(*) FILTER (
        WHERE target_table='events' AND disposition='pending'
          AND ai_validation_status='needs_review'
      )::int AS event_needs_review,
      count(*) FILTER (WHERE disposition='rejected')::int AS rejected,
      count(*) FILTER (
        WHERE disposition NOT IN ('inserted','updated')
          AND ai_validation_status <> 'needs_review'
      )::int AS automation_open,
      (SELECT count(*)::int FROM public.venue_sources WHERE source_slug='agendaq') AS venue_sources,
      (SELECT count(*)::int FROM public.event_sources WHERE source_slug='agendaq') AS event_sources,
      (SELECT count(*)::int
       FROM public.review_queue q
       JOIN public.ingestion_staging s ON s.id=q.entity_id
       WHERE q.entity_type='ingestion_staging' AND q.status='pending'
         AND q.review_type='validate_flag' AND s.source_name='agendaq') AS review_queue_open,
      (SELECT status FROM public.pipeline_runs WHERE id='${RUN_ID}'::uuid) AS pipeline_status,
      (SELECT items_processed FROM public.pipeline_runs WHERE id='${RUN_ID}'::uuid) AS pipeline_items_processed,
      (SELECT items_succeeded FROM public.pipeline_runs WHERE id='${RUN_ID}'::uuid) AS pipeline_items_succeeded,
      (SELECT items_failed FROM public.pipeline_runs WHERE id='${RUN_ID}'::uuid) AS pipeline_items_failed
    FROM public.ingestion_staging
    WHERE source_name='agendaq';`);
  const result = rows[0];
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function finalize(): Promise<void> {
  const result = await audit();
  const succeeded = result.venue_terminal + result.event_terminal;
  const needsReview = result.venue_needs_review + result.event_needs_review;
  const complete =
    result.venue_total === 3_877 &&
    result.event_total === 16_433 &&
    result.venue_terminal + result.venue_needs_review === result.venue_total &&
    result.event_terminal + result.event_needs_review === result.event_total &&
    result.venue_sources === result.venue_terminal &&
    result.event_sources === result.event_terminal &&
    result.review_queue_open === needsReview &&
    result.rejected === 0 &&
    result.automation_open === 0;
  if (!complete) throw new Error('AgendaQ completion audit failed');
  await sql(`
    UPDATE public.pipeline_runs
    SET status='completed',
        items_processed=${result.venue_total + result.event_total},
        items_succeeded=${succeeded},
        items_failed=${needsReview},
        completed_at=now(),
        duration_ms=(extract(epoch FROM (now() - started_at)) * 1000)::int,
        context=context || jsonb_build_object(
          'needs_review', ${needsReview},
          'venue_sources', ${result.venue_sources},
          'event_sources', ${result.event_sources}
        ),
        error_message=NULL,
        updated_at=now()
    WHERE id='${RUN_ID}'::uuid;`);
  console.log('[agendaq] completion audit passed and pipeline run finalized');
}

async function main(): Promise<void> {
  if (process.argv.includes('--apply-remediation')) {
    const migration = readFileSync(
      new URL(
        '../../supabase/migrations/20261006150000_agendaq_pipeline_remediation.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await sql(migration);
    console.log('[agendaq] remediation migration applied');
    return;
  }
  if (process.argv.includes('--inspect-rejected')) {
    await inspectRejected();
    return;
  }
  if (process.argv.includes('--reconcile-reviews')) {
    await reconcileReviewQueue();
    return;
  }
  if (process.argv.includes('--audit')) {
    await audit();
    return;
  }
  if (process.argv.includes('--finalize')) {
    await finalize();
    return;
  }
  await drain('venues');
  await drain('events');
  console.log('[agendaq] automated pipeline work fully drained');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
