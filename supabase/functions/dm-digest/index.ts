import { unreadMessageEmail } from "../_shared/email-activity.ts";
import { fromHeader, getEmailBranding, wrapHtml } from "../_shared/branding.ts";
/**
 * dm-digest — daily email digest of unread direct messages.
 *
 * Invoked by pg_cron with the internal-invoke secret. Selects candidates via
 * dm_digest_candidates() (independent email opt-in, unread DMs older than N
 * hours, not already digested today), emails each, and records push_sent
 * (kind='dm_digest') so a user gets at most one digest per day.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { isEmailConfigured, sendEmail } from "../_shared/email.ts";
import {
  getCorsHeaders,
  requireInternalOrAdmin,
} from "../_shared/supabase-client.ts";
import { safeErrCode } from '../_shared/safe-error.ts'

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsFor = (req: Request) => ({
  ...getCorsHeaders(req),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
});

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: cors });
  }

  const auth = await requireInternalOrAdmin(
    req,
    createClient(SUPABASE_URL, SERVICE_ROLE_KEY),
  );
  if (auth instanceof Response) return auth;

  if (!isEmailConfigured()) {
    return new Response(
      JSON.stringify({ ok: false, error: "email not configured" }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }

  const { data, error } = await admin.rpc("dm_digest_candidates", {
    p_min_age_hours: 2,
  });
  if (error) {
    return new Response(JSON.stringify({ error: safeErrCode(error, [], 'dm-digest') }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const c of (data ?? []) as Candidate[]) {
    const message = unreadMessageEmail(c.unread_count);
    try {
      const branding = await getEmailBranding();
      await sendEmail({
        idempotencyKey: `dm-digest:${c.user_id}:${today}`,
        recipientUserId: c.user_id,
        templateKey: "dm_digest",
        from: fromHeader(branding),
        to: [c.email],
        subject: message.subject,
        html: wrapHtml(message.html, branding),
        text: message.text,
      });
      await admin.from("push_sent").insert({
        user_id: c.user_id,
        kind: "dm_digest",
        ref_id: c.user_id,
        day_bucket: today,
      });
      sent += 1;
    } catch {
      console.error("dm-digest delivery pending or failed");
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
