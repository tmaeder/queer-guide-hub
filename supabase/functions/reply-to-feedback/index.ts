/**
 * reply-to-feedback — admin/moderator endpoint.
 * Appends a reply to data->replies and (if the submitter left a contact email)
 * emails them via Resend. The conversation stays in the submission's jsonb so
 * we don't churn the schema for every message.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { sendEmail, isEmailConfigured } from '../_shared/email.ts';

const ALLOWED_ORIGINS = new Set<string>([
  'https://queer.guide',
  'https://www.queer.guide',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
]);

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
  };
}

function jsonResponse(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 500, req?: Request): Response {
  return jsonResponse({ error: message, success: false }, status, req);
}

function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function requireAdmin(
  req: Request,
  svc: SupabaseClient,
): Promise<{ userId: string; displayName: string } | Response> {
  const auth = req.headers.get('Authorization');
  if (!auth) return errorResponse('Missing authorization header', 401, req);
  const token = auth.replace('Bearer ', '');
  const { data: userData, error } = await svc.auth.getUser(token);
  if (error || !userData.user) return errorResponse('Invalid authorization', 401, req);

  const { data: roles } = await svc
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id);
  const ok = (roles || []).some((r) => r.role === 'admin' || r.role === 'moderator');
  if (!ok) return errorResponse('Forbidden', 403, req);

  const displayName =
    (userData.user.user_metadata as Record<string, unknown>)?.display_name as string | undefined;
  return {
    userId: userData.user.id,
    displayName: displayName || userData.user.email || 'Admin',
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml(title: string, body: string, submissionId: string): string {
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <p>Hi — thanks for flagging this on queer.guide. An admin has a reply for you:</p>
  <div style="border-left:3px solid #b60d3d;padding:12px 16px;margin:16px 0;background:#faf5f6">
    <div style="font-weight:600;margin-bottom:8px">${escapeHtml(title)}</div>
    <div style="white-space:pre-wrap;line-height:1.5">${safeBody}</div>
  </div>
  <p style="color:#666;font-size:12px">Reference: ${submissionId}</p>
  <p style="color:#666;font-size:12px">— The Queer Guide team</p>
</body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, req);
  }

  const svc = getServiceClient();
  const authResult = await requireAdmin(req, svc);
  if (authResult instanceof Response) return authResult;
  const { userId, displayName } = authResult;

  let payload: { submission_id?: string; body?: string; notify?: boolean };
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }
  const submissionId = payload.submission_id?.trim();
  const body = payload.body?.trim();
  const notify = payload.notify !== false;
  if (!submissionId || !body) {
    return errorResponse('submission_id and body are required', 400, req);
  }
  if (body.length > 5000) {
    return errorResponse('Reply body too long (max 5000 chars)', 400, req);
  }

  const { data: row, error: fetchErr } = await svc
    .from('community_submissions')
    .select('id,data,content_type')
    .eq('id', submissionId)
    .maybeSingle();
  if (fetchErr) return errorResponse(fetchErr.message, 500, req);
  if (!row || row.content_type !== 'feedback') {
    return errorResponse('Feedback submission not found', 404, req);
  }

  const data = (row.data ?? {}) as Record<string, unknown>;
  const replies = Array.isArray(data.replies)
    ? (data.replies as Array<Record<string, unknown>>)
    : [];
  const at = new Date().toISOString();
  const newReply = {
    by: userId,
    by_name: displayName,
    body,
    at,
    emailed: false as boolean,
    email_id: null as string | null,
    email_error: null as string | null,
  };

  const contactEmail =
    typeof data.contact_email === 'string' ? (data.contact_email as string).trim() : '';
  if (notify && contactEmail && isEmailConfigured()) {
    try {
      const result = await sendEmail({
        from: 'The Queer Guide <noreply@resend.dev>',
        to: [contactEmail],
        subject: `Re: ${String(data.title ?? 'your feedback')}`,
        html: buildEmailHtml(String(data.title ?? 'your feedback'), body, submissionId),
        text: body,
      });
      newReply.emailed = !result.error;
      newReply.email_id = result.id;
      newReply.email_error = result.error;
    } catch (e) {
      newReply.email_error = e instanceof Error ? e.message : String(e);
    }
  }

  const nextData = { ...data, replies: [...replies, newReply] };
  const { error: updErr } = await svc
    .from('community_submissions')
    .update({ data: nextData, reviewed_by: userId, reviewed_at: at })
    .eq('id', submissionId);
  if (updErr) return errorResponse(updErr.message, 500, req);

  return jsonResponse({ success: true, reply: newReply }, 200, req);
});
