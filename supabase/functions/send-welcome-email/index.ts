import {
  loadEmailTemplate,
  recipientEmailLocale,
} from "../_shared/email-content.ts";
import { renderEmailTemplate } from "../_shared/email-render.ts";
// Send welcome email after a user verifies their account.
//
// Triggered by Supabase auth webhook on email confirmation, OR by an
// internal call after the profile row is created. Idempotent: checks
// profiles.welcome_email_sent_at before sending.
//
// Reuses the existing 'welcome' template in public.email_templates and
// the shared sendEmail() helper (Cloudflare backend).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { sendEmail } from "../_shared/email.ts";
import { fromHeader, getEmailBranding, wrapHtml } from "../_shared/branding.ts";
import {
  getCorsHeaders,
  getServiceClient,
  hasInternalSecret,
  requireAdmin,
} from "../_shared/supabase-client.ts";
import { safeErrCode } from '../_shared/safe-error.ts'

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RequestBody {
  user_id: string;
  email?: string;
  display_name?: string;
  journey?: { runId: string; leaseId: string; stepId: string };
}

const handler = async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

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
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!body.user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Idempotency: check if already sent
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("user_id, email, display_name, welcome_email_sent_at")
    .eq("user_id", body.user_id)
    .maybeSingle();

  if (profileErr) {
    console.error("profile lookup failed", profileErr);
    return new Response(JSON.stringify({ error: safeErrCode(profileErr, [], 'send-welcome-email') }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!profile) {
    return new Response(JSON.stringify({ error: "profile not found" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (profile.welcome_email_sent_at) {
    return new Response(JSON.stringify({ status: "already_sent" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const toEmail = body.email ?? profile.email;
  if (!toEmail) {
    return new Response(JSON.stringify({ error: "no email on profile" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Load template from existing email_templates table
  let tpl;
  try {
    tpl = await loadEmailTemplate(
      supabase,
      "welcome",
      await recipientEmailLocale(supabase, profile.user_id),
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Active email content unavailable" }),
      { status: 503, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const vars = {
    display_name: body.display_name ?? profile.display_name ?? "there",
    site_url: Deno.env.get("SITE_URL") ?? "https://queer.guide",
  };

  try {
    const branding = await getEmailBranding();
    const rendered = renderEmailTemplate(tpl, {
      ...vars,
      site_name: branding.from_name,
    });
    await sendEmail({
      idempotencyKey: `welcome:${profile.user_id}`,
      templateKey: "welcome",
      recipientUserId: profile.user_id,
      journey: body.journey,
      from: fromHeader(branding),
      to: [toEmail],
      subject: rendered.subject,
      html: wrapHtml(rendered.html, branding),
      text: rendered.text,
    });
  } catch (e) {
    console.error("welcome email send failed", e);
    return new Response(JSON.stringify({ error: safeErrCode(e, [], 'send-welcome-email') }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  await supabase
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("user_id", body.user_id);

  return new Response(JSON.stringify({ status: "sent" }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
};

Deno.serve(handler);
