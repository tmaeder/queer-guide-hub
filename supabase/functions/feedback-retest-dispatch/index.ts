// feedback-retest-dispatch
// Picks up a queued feedback_retest_runs row, hands it to the active runner,
// and records the result. Mirror of claude-routine-dispatch.

import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from '../_shared/supabase-client.ts';
import { pickRetestRunner } from '../_shared/feedback-runners/registry.ts';

interface BodyShape {
  retest_id?: string;
  runner?: string;
}

Deno.serve(async (req) => {
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
  if (!body.retest_id) return errorResponse('retest_id_required', 400, req);

  const { data: retest, error } = await service
    .from('feedback_retest_runs')
    .select(
      'id,routine_run_id,kind,status,runner, routine:feedback_routine_runs(story_id, files_changed)',
    )
    .eq('id', body.retest_id)
    .single<{
      id: string;
      routine_run_id: string;
      kind: 'typecheck' | 'lint' | 'unit' | 'e2e' | 'targeted';
      status: string;
      runner: string;
      routine: { story_id: string; files_changed: string[] | null } | null;
    }>();
  if (error || !retest) return errorResponse('retest_not_found', 404, req);
  if (retest.status !== 'queued') {
    return errorResponse(`retest_not_dispatchable (status=${retest.status})`, 409, req);
  }

  let runner;
  try {
    runner = pickRetestRunner(body.runner ?? retest.runner);
  } catch (e) {
    return errorResponse((e as Error).message, 400, req);
  }

  const projectUrl = Deno.env.get('SUPABASE_URL')!;
  const callbackUrl = `${projectUrl}/functions/v1/feedback-retest-callback`;
  const hmacSecret = Deno.env.get('FEEDBACK_RUNNER_HMAC_SECRET') ?? '';

  // Flip to running before calling the runner (status is durable even if
  // dispatch crashes mid-flight).
  await service.rpc('record_retest_result', {
    p_retest_id: retest.id,
    p_status: 'running',
    p_result: { runner: runner.name },
    p_external_ref: null,
    p_actor_kind: 'system',
  });

  let dispatched;
  try {
    dispatched = await runner.dispatch({
      retestId: retest.id,
      routineRunId: retest.routine_run_id,
      storyId: retest.routine?.story_id ?? '',
      kind: retest.kind,
      callbackUrl,
      hmacSecret,
      service,
      filesChanged:
        retest.kind === 'targeted' ? retest.routine?.files_changed ?? [] : undefined,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await service.rpc('record_retest_result', {
      p_retest_id: retest.id,
      p_status: 'error',
      p_result: { error: msg },
      p_external_ref: null,
      p_actor_kind: 'system',
    });
    return errorResponse(`dispatch_failed: ${msg}`, 502, req);
  }

  if (dispatched.syncResult) {
    await service.rpc('record_retest_result', {
      p_retest_id: retest.id,
      p_status: dispatched.syncResult.status,
      p_result: dispatched.syncResult.result,
      p_external_ref: dispatched.externalRef,
      p_actor_kind: 'runner',
    });
  } else {
    // record dispatched external_ref so async callbacks can dedupe
    await service
      .from('feedback_retest_runs')
      .update({ external_ref: dispatched.externalRef })
      .eq('id', retest.id);
  }

  return jsonResponse(
    { retest_id: retest.id, runner: runner.name, external_ref: dispatched.externalRef, sync: !!dispatched.syncResult },
    200,
    req,
  );
});
