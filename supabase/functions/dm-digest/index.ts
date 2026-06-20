/**
 * dm-digest — daily email digest of unread direct messages.
 *
 * Invoked by pg_cron with the internal-invoke secret. Selects candidates via
 * dm_digest_candidates() (opt-in via dm_push_enabled, unread DMs older than N
 * hours, not already digested today), emails each, and records push_sent
 * (kind='dm_digest') so a user gets at most one digest per day.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { sendEmail, isEmailConfigured } from '../_shared/email.ts';
import { getCorsHeaders, requireInternalOrAdmin } from '../_shared/supabase-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE = 'https://queer.guide';

const corsFor = (req: Request) => ({
  ...getCorsHeaders(req),
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
});

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Candidate {
  user_id: string;
  email: string;
  display_name: string | null;
  unread_count: number;
  latest_title: string | null;
  latest_preview: string | null;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  const auth = await requireInternalOrAdmin(req, createClient(SUPABASE_URL, SERVICE_ROLE_KEY));
  if (auth instanceof Response) return auth;

  if (!isEmailConfigured()) {
    return new Response(JSON.stringify({ ok: false, error: 'email not configured' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await admin.rpc('dm_digest_candidates', { p_min_age_hours: 2 });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let sent = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const c of (data ?? []) as Candidate[]) {
    const name = c.display_name ? esc(c.display_name) : 'there';
    const count = c.unread_count;
    const heading =
      count === 1
        ? `${esc(c.latest_title ?? 'Someone')} sent you a message`
        : `You have ${count} unread messages`;
    const preview = c.latest_preview ? `<p style="color:#555">${esc(c.latest_preview)}</p>` : '';
    const html = `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto">
        <h2 style="font-size:20px">${heading}</h2>
        <p>Hi ${name}, you have unread messages waiting on Queer Guide.</p>
        ${preview}
        <p><a href="${SITE}/messages" style="display:inline-block;background:#0a0a0a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open messages</a></p>
        <p style="color:#999;font-size:12px">You receive this because direct-message notifications are on. Turn them off in Profile settings.</p>
      </div>`;
    try {
      await sendEmail({
        from: 'Queer Guide <noreply@queer.guide>',
        to: [c.email],
        subject: count === 1 ? heading : `${count} unread messages on Queer Guide`,
        html,
        text: `${heading}. Open ${SITE}/messages`,
      });
      await admin.from('push_sent').insert({
        user_id: c.user_id,
        kind: 'dm_digest',
        ref_id: c.user_id,
        day_bucket: today,
      });
      sent += 1;
    } catch (err) {
      console.error('dm-digest send failed', c.user_id, err);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
