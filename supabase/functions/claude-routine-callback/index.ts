// claude-routine-callback
// Webhook endpoint for async runners (github_actions, webhook) to report back
// progress and fix_proposed events. Verifies HMAC before touching the DB.
//
// Body shape (POST):
//   { run_id, kind: 'progress' | 'fix_proposed' | 'failed', ...fields }
// Required header: X-Feedback-Signature: sha256=<hex(hmac(body))>

import { corsResponse, errorResponse, getServiceClient, jsonResponse } from '../_shared/supabase-client.ts';
import { verifyHmac } from '../_shared/hmac.ts';

interface CallbackBody {
  run_id: string;
  kind: 'progress' | 'fix_proposed' | 'failed';
  status?: string;
  external_ref?: string;
  payload?: Record<string, unknown>;
  pr_url?: string;
  commit_sha?: string;
  files_changed?: string[];
  summary?: string;
  confidence?: 'low' | 'medium' | 'high';
  risks?: string;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405, req);

  const secret = Deno.env.get('FEEDBACK_RUNNER_HMAC_SECRET');
  if (!secret) return errorResponse('callback not configured', 500, req);

  const raw = await req.text();
  const sig = req.headers.get('X-Feedback-Signature') ?? '';
  if (!(await verifyHmac(raw, sig, secret))) {
    return errorResponse('bad_signature', 401, req);
  }

  let body: CallbackBody;
  try {
    body = JSON.parse(raw) as CallbackBody;
  } catch {
    return errorResponse('invalid_json', 400, req);
  }
  if (!body.run_id || !body.kind) return errorResponse('run_id_and_kind_required', 400, req);

  const service = getServiceClient();

  if (body.kind === 'progress') {
    const status = body.status ?? 'in_progress';
    const { error } = await service.rpc('record_routine_progress', {
      p_run_id: body.run_id,
      p_status: status,
      p_payload: body.payload ?? {},
      p_external_ref: body.external_ref ?? null,
      p_actor_kind: 'runner',
    });
    if (error) return errorResponse(error.message, 400, req);
    return jsonResponse({ ok: true }, 200, req);
  }

  if (body.kind === 'failed') {
    const { error } = await service.rpc('record_routine_progress', {
      p_run_id: body.run_id,
      p_status: 'failed',
      p_payload: { error: body.error ?? 'runner_reported_failure', ...(body.payload ?? {}) },
      p_external_ref: body.external_ref ?? null,
      p_actor_kind: 'runner',
    });
    if (error) return errorResponse(error.message, 400, req);
    return jsonResponse({ ok: true }, 200, req);
  }

  if (body.kind === 'fix_proposed') {
    const { error } = await service.rpc('record_fix_proposed', {
      p_run_id: body.run_id,
      p_pr_url: body.pr_url ?? null,
      p_commit_sha: body.commit_sha ?? null,
      p_files: body.files_changed ?? null,
      p_summary: body.summary ?? null,
      p_confidence: body.confidence ?? null,
      p_risks: body.risks ?? null,
      p_actor_kind: 'runner',
    });
    if (error) return errorResponse(error.message, 400, req);
    return jsonResponse({ ok: true }, 200, req);
  }

  return errorResponse('unknown_kind', 400, req);
});
