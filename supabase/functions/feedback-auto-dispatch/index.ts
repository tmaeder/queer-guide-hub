// feedback-auto-dispatch
//
// Cron-driven (every 15 min, X-Internal-Secret gated). Selects bug-only,
// settled, un-dispatched feedback stories via select_auto_dispatch_stories,
// builds the redacted prompt server-side, and queues each for the local Claude
// runner via auto_dispatch_story → record_routine_progress('dispatched').
//
// The kill switch + daily cap live in admin_automations('feedback_auto_dispatch')
// and are enforced inside the RPCs, so this function is safe to leave scheduled.
// verify_jwt=false; self-gates with requireInternalOrAdmin.

import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts';
import { buildStoryPrompt } from '../_shared/build-story-prompt.ts';

interface BodyShape {
  limit?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405, req);

  const service = getServiceClient();
  const auth = await requireInternalOrAdmin(req, service);
  if (auth instanceof Response) return auth;

  let body: BodyShape = {};
  try {
    body = (await req.json()) as BodyShape;
  } catch {
    /* empty body is fine */
  }
  const limit = Math.min(Math.max(body.limit ?? 5, 1), 20);

  const { data: stories, error: selErr } = await service.rpc('select_auto_dispatch_stories', {
    p_limit: limit,
  });
  if (selErr) return errorResponse(`select_failed: ${selErr.message}`, 400, req);

  const ids: string[] = (stories ?? []).map((r: { story_id: string }) => r.story_id);
  const results: Array<{ story_id: string; status: string; run_id?: string; error?: string }> = [];

  for (const storyId of ids) {
    try {
      const built = await buildStoryPrompt(service, storyId);

      const { data: run, error: dErr } = await service.rpc('auto_dispatch_story', {
        p_story_id: storyId,
        p_prompt: built.prompt,
        p_prompt_hash: built.prompt_hash,
      });
      if (dErr) {
        results.push({ story_id: storyId, status: 'error', error: dErr.message });
        continue;
      }
      const runRow = (Array.isArray(run) ? run[0] : run) as
        | { id: string; status: string }
        | null;
      if (!runRow) {
        results.push({ story_id: storyId, status: 'error', error: 'no_run_row' });
        continue;
      }

      // Already live (idempotent hit) — leave it to the daemon.
      if (runRow.status !== 'queued') {
        results.push({ story_id: storyId, status: runRow.status, run_id: runRow.id });
        continue;
      }

      // Local runner dispatch is a no-op; just flip the run to 'dispatched' so the
      // poller daemon claims it (matches claude-routine-dispatch's local path).
      await service.rpc('record_routine_progress', {
        p_run_id: runRow.id,
        p_status: 'dispatched',
        p_payload: { runner: 'local', auto: true },
        p_external_ref: `local-${runRow.id}`,
        p_actor_kind: 'system',
      });
      results.push({ story_id: storyId, status: 'dispatched', run_id: runRow.id });
    } catch (e) {
      results.push({ story_id: storyId, status: 'error', error: (e as Error).message });
    }
  }

  const dispatched = results.filter((r) => r.status === 'dispatched').length;
  return jsonResponse(
    { examined: ids.length, dispatched, results },
    200,
    req,
  );
});
