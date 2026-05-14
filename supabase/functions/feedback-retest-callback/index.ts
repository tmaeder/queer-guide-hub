// feedback-retest-callback
// HMAC-verified webhook for async retest runners to post their results.
//   POST { retest_id, status: 'passed'|'failed'|'error'|'running', result?: {...} }
//   Header: X-Feedback-Signature: sha256=<hex>

import { corsResponse, errorResponse, getServiceClient, jsonResponse } from '../_shared/supabase-client.ts';
import { verifyHmac } from '../_shared/hmac.ts';

interface CallbackBody {
  retest_id: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  result?: Record<string, unknown>;
  external_ref?: string;
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
  if (!body.retest_id || !body.status) return errorResponse('retest_id_and_status_required', 400, req);

  const service = getServiceClient();
  const { error } = await service.rpc('record_retest_result', {
    p_retest_id: body.retest_id,
    p_status: body.status,
    p_result: body.result ?? {},
    p_external_ref: body.external_ref ?? null,
    p_actor_kind: 'runner',
  });
  if (error) return errorResponse(error.message, 400, req);
  return jsonResponse({ ok: true }, 200, req);
});
