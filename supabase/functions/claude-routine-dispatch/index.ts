// claude-routine-dispatch
// Picks up a queued feedback_routine_runs row, hands it to the active runner
// (mock | github_actions | webhook | api), and records progress.
//
// Client flow:
//   1. Client calls dispatch_claude_routine RPC with prompt + prompt_hash.
//      RPC validates approval, rate limit, dedup, and inserts a row in
//      feedback_routine_runs with status='queued'.
//   2. Client posts {run_id} to this function.
//   3. This function loads the run, calls the runner, and (for sync runners)
//      immediately records 'fix_proposed'. For async runners it records
//      'dispatched' and returns; the runner posts back to claude-routine-callback.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsResponse,
  errorResponse,
  getCorsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from '../_shared/supabase-client.ts';
import { pickFixRunner } from '../_shared/feedback-runners/registry.ts';

interface BodyShape {
  run_id?: string;
  /** Optional override (admin-only); falls back to FEEDBACK_FIX_RUNNER env. */
  runner?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405, req);

  const service = getServiceClient();
  const auth = await requireAdmin(req, service);
  if (auth instanceof Response) return auth;

  let body: BodyShape;
  try {
    body = (await req.json()) as BodyShape;
  } catch {
    return errorResponse('invalid_json', 400, req);
  }
  if (!body.run_id) return errorResponse('run_id_required', 400, req);

  const { data: run, error } = await service
    .from('feedback_routine_runs')
    .select('id,story_id,status,runner,prompt')
    .eq('id', body.run_id)
    .single();
  if (error || !run) return errorResponse('run_not_found', 404, req);
  if (run.status !== 'queued') {
    return errorResponse(`run_not_dispatchable (status=${run.status})`, 409, req);
  }

  let runner;
  try {
    runner = pickFixRunner(body.runner ?? run.runner);
  } catch (e) {
    return errorResponse((e as Error).message, 400, req);
  }

  const projectUrl = Deno.env.get('SUPABASE_URL')!;
  const callbackUrl = `${projectUrl}/functions/v1/claude-routine-callback`;
  const hmacSecret = Deno.env.get('FEEDBACK_RUNNER_HMAC_SECRET') ?? '';

  let dispatched;
  try {
    dispatched = await runner.dispatch({
      runId: run.id,
      storyId: run.story_id,
      prompt: run.prompt,
      callbackUrl,
      hmacSecret,
      service,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await service.rpc('record_routine_progress', {
      p_run_id: run.id,
      p_status: 'failed',
      p_payload: { error: msg },
      p_external_ref: null,
      p_actor_kind: 'system',
    });
    return errorResponse(`dispatch_failed: ${msg}`, 502, req);
  }

  // Record dispatched first so external_ref + status are durable even if the
  // sync result write fails.
  await service.rpc('record_routine_progress', {
    p_run_id: run.id,
    p_status: 'dispatched',
    p_payload: { runner: runner.name },
    p_external_ref: dispatched.externalRef,
    p_actor_kind: 'system',
  });

  if (dispatched.syncResult) {
    const r = dispatched.syncResult;
    await service.rpc('record_fix_proposed', {
      p_run_id: run.id,
      p_pr_url: r.prUrl ?? null,
      p_commit_sha: r.commitSha ?? null,
      p_files: r.filesChanged ?? null,
      p_summary: r.summary ?? null,
      p_confidence: r.confidence ?? null,
      p_risks: r.risks ?? null,
      p_actor_kind: 'runner',
    });
  }

  return jsonResponse(
    { run_id: run.id, runner: runner.name, external_ref: dispatched.externalRef, sync: !!dispatched.syncResult },
    200,
    req,
  );
});
