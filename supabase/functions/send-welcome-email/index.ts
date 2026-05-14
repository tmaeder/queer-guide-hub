// Send welcome email after a user verifies their account.
//
// Triggered by Supabase auth webhook on email confirmation, OR by an
// internal call after the profile row is created. Idempotent: checks
// profiles.welcome_email_sent_at before sending.
//
// Reuses the existing 'welcome' template in public.email_templates and
// the shared sendEmail() helper (Resend backend).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { sendEmail } from '../_shared/email.ts';
import { getCorsHeaders } from '../_shared/supabase-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RequestBody {
  user_id: string;
  email?: string;
  display_name?: string;
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

const handler = async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!body.user_id) {
    return new Response(JSON.stringify({ error: 'user_id required' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Idempotency: check if already sent
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('user_id, email, display_name, welcome_email_sent_at')
    .eq('user_id', body.user_id)
    .maybeSingle();

  if (profileErr) {
    console.error('profile lookup failed', profileErr);
    return new Response(JSON.stringify({ error: profileErr.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (!profile) {
    return new Response(JSON.stringify({ error: 'profile not found' }), {
      status: 404,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (profile.welcome_email_sent_at) {
    return new Response(JSON.stringify({ status: 'already_sent' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const toEmail = body.email ?? profile.email;
  if (!toEmail) {
    return new Response(JSON.stringify({ error: 'no email on profile' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Load template from existing email_templates table
  const { data: tpl, error: tplErr } = await supabase
    .from('email_templates')
    .select('subject, body_html, body_text')
    .eq('template_key', 'welcome')
    .eq('is_active', true)
    .maybeSingle();

  if (tplErr || !tpl) {
    return new Response(JSON.stringify({ error: 'welcome template missing' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const vars = {
    display_name: body.display_name ?? profile.display_name ?? '',
    site_url: Deno.env.get('SITE_URL') ?? 'https://queer.guide',
  };

  try {
    await sendEmail({
      from: 'The Queer Guide <noreply@queer.guide>',
      to: [toEmail],
      subject: renderTemplate(tpl.subject, vars),
      html: renderTemplate(tpl.body_html, vars),
      text: tpl.body_text ? renderTemplate(tpl.body_text, vars) : undefined,
    });
  } catch (e) {
    console.error('welcome email send failed', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  await supabase
    .from('profiles')
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq('user_id', body.user_id);

  return new Response(JSON.stringify({ status: 'sent' }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
};

Deno.serve(handler);
