// claude-routine-dispatch
// Builds the redacted prompt server-side, reserves a routine run via the
// dispatch_claude_routine RPC, and hands the run to the active runner.
//
// Client flow:
//   1. Client posts { story_id, runner?, prompt_override? } with admin JWT.
//   2. This function:
//      a. Verifies admin and resolves a user-scoped client (so the RPC's
//         auth.uid() returns the admin and the rate-limit counter attributes
//         to them).
//      b. Builds the redacted combined-story prompt server-side from the
//         submission rows. Skipped when prompt_override is supplied.
//      c. Calls dispatch_claude_routine RPC (validates approval, dedups
//         on prompt_hash, inserts a queued feedback_routine_runs row).
//      d. If the row is freshly queued, hands it to the runner adapter.
//         Sync runners (mock) report fix_proposed inline; async runners
//         (github_actions, webhook) post back to claude-routine-callback.
//
// Backwards-compat: still accepts { run_id } from older clients that
// reserve the run themselves.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from '../_shared/supabase-client.ts';
import { pickFixRunner } from '../_shared/feedback-runners/registry.ts';
import { buildStoryPrompt } from '../_shared/build-story-prompt.ts';

interface BodyShape {
  story_id?: string;
  run_id?: string;
  runner?: string;
  prompt_override?: string;
}

async function hashPrompt(p: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function userClientFor(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
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
  if (!body.story_id && !body.run_id) {
    return errorResponse('story_id_or_run_id_required', 400, req);
  }

  const runnerName = body.runner ?? Deno.env.get('FEEDBACK_FIX_RUNNER') ?? 'mock';

  // Path A — client supplied story_id; we build prompt + reserve run server-side.
  let runRow:
    | {
        id: string;
        story_id: string;
        status: string;
        runner: string;
        prompt: string;
      }
    | null = null;

  if (body.story_id) {
    let prompt: string;
    let promptHash: string;
    if (body.prompt_override && body.prompt_override.trim()) {
      prompt = body.prompt_override;
      promptHash = await hashPrompt(prompt);
    } else {
      try {
        const built = await buildStoryPrompt(service, body.story_id);
        prompt = built.prompt;
        promptHash = built.prompt_hash;
      } catch (e) {
        return errorResponse(`prompt_build_failed: ${(e as Error).message}`, 400, req);
      }
    }

    const userClient = userClientFor(req);
    const { data, error } = await userClient.rpc('dispatch_claude_routine', {
      p_story_id: body.story_id,
      p_runner: runnerName,
      p_prompt: prompt,
      p_prompt_hash: promptHash,
    });
    if (error) return errorResponse(error.message, 400, req);
    const reserved = (Array.isArray(data) ? data[0] : data) as typeof runRow;
    if (!reserved) return errorResponse('dispatch_rpc_returned_no_row', 500, req);
    runRow = reserved;
  } else if (body.run_id) {
    const { data, error } = await service
      .from('feedback_routine_runs')
      .select('id,story_id,status,runner,prompt')
      .eq('id', body.run_id)
      .single();
    if (error || !data) return errorResponse('run_not_found', 404, req);
    runRow = data as typeof runRow;
  }

  if (!runRow) return errorResponse('no_run', 500, req);
  if (runRow.status !== 'queued') {
    // Idempotent re-dispatch hit the live unique index; surface the existing run.
    return jsonResponse(
      { run_id: runRow.id, runner: runRow.runner, status: runRow.status, sync: false },
      200,
      req,
    );
  }

  let runner;
  try {
    runner = pickFixRunner(body.runner ?? runRow.runner);
  } catch (e) {
    return errorResponse((e as Error).message, 400, req);
  }

  const projectUrl = Deno.env.get('SUPABASE_URL')!;
  const callbackUrl = `${projectUrl}/functions/v1/claude-routine-callback`;
  const hmacSecret = Deno.env.get('FEEDBACK_RUNNER_HMAC_SECRET') ?? '';

  let dispatched;
  try {
    dispatched = await runner.dispatch({
      runId: runRow.id,
      storyId: runRow.story_id,
      prompt: runRow.prompt,
      callbackUrl,
      hmacSecret,
      service,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await service.rpc('record_routine_progress', {
      p_run_id: runRow.id,
      p_status: 'failed',
      p_payload: { error: msg },
      p_external_ref: null,
      p_actor_kind: 'system',
    });
    return errorResponse(`dispatch_failed: ${msg}`, 502, req);
  }

  await service.rpc('record_routine_progress', {
    p_run_id: runRow.id,
    p_status: 'dispatched',
    p_payload: { runner: runner.name },
    p_external_ref: dispatched.externalRef,
    p_actor_kind: 'system',
  });

  if (dispatched.syncResult) {
    const r = dispatched.syncResult;
    await service.rpc('record_fix_proposed', {
      p_run_id: runRow.id,
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
    {
      run_id: runRow.id,
      runner: runner.name,
      external_ref: dispatched.externalRef,
      sync: !!dispatched.syncResult,
    },
    200,
    req,
  );
});
