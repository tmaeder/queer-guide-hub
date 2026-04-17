/**
 * notify-feedback-status — admin/moderator endpoint.
 *
 * Ticketing-style notification: when an admin moves a submission between
 * kanban columns or forwards it to Claude/GitHub, email the submitter with a
 * status-specific template and record a `system` reply in data.replies so the
 * full loop is visible in the drawer thread.
 *
 * Body: { submission_id, event }
 *   event ∈ 'status_changed' | 'handed_to_claude' | 'resolved' | 'reopened'
 * Also accepts { new_status } for status_changed so the template picks the
 * right copy (under_review / planned / in_progress).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { Resend } from 'npm:resend@2.0.0';

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

type NotifyEvent = 'status_changed' | 'handed_to_claude' | 'resolved' | 'reopened';

interface Template {
  subject: string;
  heading: string;
  body: string;
  cta?: string;
}

function buildTemplate(
  event: NotifyEvent,
  newStatus: string | null,
  title: string,
  resolution: string | null,
): Template {
  const safeTitle = title || 'your feedback';
  if (event === 'handed_to_claude') {
    return {
      subject: `In progress: ${safeTitle}`,
      heading: 'An engineer is on it',
      body:
        'Thanks for the report. An AI engineer (Claude) has picked this up and is investigating. ' +
        'We will email you again when it is resolved.',
    };
  }
  if (event === 'resolved') {
    const resNote =
      resolution === 'wontfix'
        ? 'We looked into this but decided not to implement a fix right now.'
        : resolution === 'duplicate'
          ? 'This turned out to be a duplicate of an existing ticket; we have linked them.'
          : resolution === 'invalid'
            ? 'We could not reproduce this. If it is still happening please reply with a screenshot or steps.'
            : 'This should now be fixed on queer.guide.';
    return {
      subject: `Resolved: ${safeTitle}`,
      heading: 'Your ticket is resolved',
      body:
        `${resNote}\n\nCould you do us a favour and verify it is really sorted on your side? ` +
        'Reply to this email if anything is still off — we will reopen the ticket.',
      cta: 'Please verify the fix',
    };
  }
  if (event === 'reopened') {
    return {
      subject: `Reopened: ${safeTitle}`,
      heading: 'We reopened your ticket',
      body: 'We reopened this ticket because something is still off. We will update you again once we have a new fix.',
    };
  }
  // status_changed
  const statusCopy: Record<string, { heading: string; body: string }> = {
    under_review: {
      heading: 'We are reviewing your report',
      body: 'Thanks for flagging this. A team member is reading through the details now.',
    },
    planned: {
      heading: 'We have planned this',
      body: 'We decided to act on this and added it to our near-term queue. We will update you when work begins.',
    },
    in_progress: {
      heading: 'Work is in progress',
      body: 'Someone is actively working on this now. We will email you again once it is resolved.',
    },
    new: {
      heading: 'Back in the queue',
      body: 'This ticket is back in the unassigned queue and will be picked up again.',
    },
    done: {
      heading: 'Your ticket is resolved',
      body: 'This should now be fixed on queer.guide. Please reply if the issue is still happening.',
    },
  };
  const copy = statusCopy[newStatus ?? ''] ?? {
    heading: 'Ticket update',
    body: 'The status of your ticket just changed.',
  };
  return {
    subject: `${copy.heading}: ${safeTitle}`,
    heading: copy.heading,
    body: copy.body,
  };
}

function buildEmailHtml(t: Template, submissionId: string): string {
  const safeBody = escapeHtml(t.body).replace(/\n/g, '<br>');
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <h2 style="color:#b60d3d;margin:0 0 12px">${escapeHtml(t.heading)}</h2>
  <div style="white-space:pre-wrap;line-height:1.5;margin:0 0 16px">${safeBody}</div>
  ${t.cta ? `<p style="color:#666;font-size:13px;margin-top:16px">${escapeHtml(t.cta)}</p>` : ''}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#666;font-size:12px">Reference: ${submissionId}</p>
  <p style="color:#666;font-size:12px">— The Queer Guide team</p>
</body></html>`;
}

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
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

  let payload: {
    submission_id?: string;
    event?: NotifyEvent;
    new_status?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }
  const submissionId = payload.submission_id?.trim();
  const event = payload.event;
  if (!submissionId || !event) {
    return errorResponse('submission_id and event are required', 400, req);
  }
  if (!['status_changed', 'handed_to_claude', 'resolved', 'reopened'].includes(event)) {
    return errorResponse('Unknown event', 400, req);
  }

  const { data: row, error: fetchErr } = await svc
    .from('community_submissions')
    .select('id,data,content_type,feedback_status,resolution,notify_submitter')
    .eq('id', submissionId)
    .maybeSingle();
  if (fetchErr) return errorResponse(fetchErr.message, 500, req);
  if (!row || row.content_type !== 'feedback') {
    return errorResponse('Feedback submission not found', 404, req);
  }
  if (row.notify_submitter === false) {
    return jsonResponse({ success: true, skipped: 'muted' }, 200, req);
  }

  const data = (row.data ?? {}) as Record<string, unknown>;
  const contactEmail =
    typeof data.contact_email === 'string' ? (data.contact_email as string).trim() : '';
  const title = typeof data.title === 'string' ? (data.title as string) : 'your feedback';

  const template = buildTemplate(
    event,
    payload.new_status ?? row.feedback_status ?? null,
    title,
    (row.resolution as string | null) ?? null,
  );

  const at = new Date().toISOString();
  const systemReply = {
    by: null as string | null,
    by_name: 'system',
    body: `${template.heading}\n\n${template.body}`,
    at,
    emailed: false as boolean,
    email_id: null as string | null,
    email_error: null as string | null,
    event,
  };

  const resend = getResend();
  if (contactEmail && resend) {
    try {
      const result = await resend.emails.send({
        from: 'The Queer Guide <noreply@resend.dev>',
        to: [contactEmail],
        subject: template.subject,
        html: buildEmailHtml(template, submissionId),
        text: `${template.heading}\n\n${template.body}`,
      });
      systemReply.emailed = !result.error;
      systemReply.email_id = result.data?.id ?? null;
      systemReply.email_error = result.error?.message ?? null;
    } catch (e) {
      systemReply.email_error = e instanceof Error ? e.message : String(e);
    }
  } else if (!contactEmail) {
    systemReply.email_error = 'no_contact_email';
  } else {
    systemReply.email_error = 'resend_not_configured';
  }

  const replies = Array.isArray(data.replies)
    ? (data.replies as Array<Record<string, unknown>>)
    : [];
  const nextData = { ...data, replies: [...replies, systemReply] };
  const { error: updErr } = await svc
    .from('community_submissions')
    .update({ data: nextData, reviewed_by: userId, reviewed_at: at })
    .eq('id', submissionId);
  if (updErr) return errorResponse(updErr.message, 500, req);

  void displayName; // only used in shared signature
  return jsonResponse(
    { success: true, emailed: systemReply.emailed, reply: systemReply },
    200,
    req,
  );
});
