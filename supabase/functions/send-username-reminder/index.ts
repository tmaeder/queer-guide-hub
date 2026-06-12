// Username-rollout claim reminder (T-14d / T-2d before auto-assign deadline).
//
// Invoked by pg_cron via run_username_claim_reminders() with
// X-Internal-Secret (fn deployed verify_jwt=false, self-gates) — same
// pattern as send-welcome-email. Idempotent: skips if the user has claimed
// a username or this stage was already sent; stamps
// profiles.username_reminder_stage after sending.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { sendEmail } from '../_shared/email.ts';
import { getCorsHeaders, getServiceClient, hasInternalSecret, requireAdmin } from '../_shared/supabase-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RequestBody {
  user_id: string;
  stage: number; // 1 = T-14, 2 = T-2
  deadline: string; // ISO date
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

const handler = async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const fail = (error: string, status: number) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  // Internal-only: pg_cron dispatch (X-Internal-Secret) or admin/service-role.
  if (!hasInternalSecret(req)) {
    const gate = await requireAdmin(req, getServiceClient());
    if (gate instanceof Response) return gate;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON', 400);
  }
  const stage = Number(body.stage);
  if (!body.user_id || ![1, 2].includes(stage)) {
    return fail('user_id and stage (1|2) required', 400);
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('user_id, email, display_name, username, username_reminder_stage')
    .eq('user_id', body.user_id)
    .maybeSingle();
  if (profileErr) return fail(profileErr.message, 500);
  if (!profile) return fail('profile not found', 404);

  // Idempotency + relevance: claimed already, or this stage already sent.
  if (profile.username) {
    return new Response(JSON.stringify({ status: 'already_claimed' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if ((profile.username_reminder_stage ?? 0) >= stage) {
    return new Response(JSON.stringify({ status: 'already_sent' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (!profile.email) return fail('no email on profile', 400);

  const { data: tpl, error: tplErr } = await supabase
    .from('email_templates')
    .select('subject, html_content, text_content')
    .eq('template_key', 'username_claim_reminder')
    .eq('is_active', true)
    .maybeSingle();
  if (tplErr || !tpl) return fail('username_claim_reminder template missing', 500);

  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://queer.guide';
  const deadline = body.deadline ? new Date(body.deadline) : null;
  const vars = {
    display_name: profile.display_name ?? 'there',
    claim_url: `${siteUrl}/claim-username`,
    deadline_date: deadline
      ? deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'the rollout deadline',
  };

  try {
    await sendEmail({
      from: 'The Queer Guide <noreply@queer.guide>',
      to: [profile.email],
      subject: renderTemplate(tpl.subject, vars),
      html: renderTemplate(tpl.html_content, vars),
      text: tpl.text_content ? renderTemplate(tpl.text_content, vars) : undefined,
    });
  } catch (e) {
    console.error('username reminder send failed', e);
    return fail((e as Error).message, 500);
  }

  await supabase
    .from('profiles')
    .update({ username_reminder_stage: stage })
    .eq('user_id', body.user_id);

  return new Response(JSON.stringify({ status: 'sent', stage }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
};

Deno.serve(handler);
