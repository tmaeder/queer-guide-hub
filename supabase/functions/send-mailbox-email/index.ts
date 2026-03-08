import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendEmail, isEmailConfigured } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface SendMailboxEmailRequest {
  to: string;
  subject: string;
  body_html?: string;
  body_text?: string;
  in_reply_to_email_id?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!isEmailConfigured()) {
    return new Response(
      JSON.stringify({ error: "Email service not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  try {
    // Authenticate: any logged-in user (not admin-only)
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const userId = authData.user.id;

    // Rate limit: 50 emails/hour per user
    const { data: allowed, error: rlError } = await supabase.rpc("check_rate_limit", {
      identifier: userId,
      max_attempts: 50,
      time_window_minutes: 60,
    });
    if (rlError || !allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Max 50 emails per hour." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Get user's mailbox address and display name
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("mailbox_address, display_name")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile?.mailbox_address) {
      return new Response(
        JSON.stringify({ error: "You must claim a mailbox address before sending emails." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const body: SendMailboxEmailRequest = await req.json();
    if (!body.to || !body.subject) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const fromAddress = `${profile.mailbox_address}@queer.guide`;
    const fromName = profile.display_name || profile.mailbox_address;

    // Threading: look up parent email for proper RFC 5322 headers
    let inReplyToHeader: string | undefined;
    let referencesHeader: string[] | undefined;
    let threadId: string | undefined;

    if (body.in_reply_to_email_id) {
      const { data: parent } = await supabase
        .from("mailbox_emails")
        .select("id, message_id_header, thread_id, references_header")
        .eq("id", body.in_reply_to_email_id)
        .eq("owner_id", userId)
        .single();

      if (parent) {
        inReplyToHeader = parent.message_id_header || undefined;
        threadId = parent.thread_id || parent.id;
        // Build references chain
        const parentRefs = (parent.references_header as string[]) || [];
        referencesHeader = parent.message_id_header
          ? [...parentRefs, parent.message_id_header]
          : parentRefs.length > 0 ? parentRefs : undefined;
      }
    }

    // Build email headers for threading
    const emailHeaders: Record<string, string> = {};
    if (inReplyToHeader) {
      emailHeaders["In-Reply-To"] = inReplyToHeader;
      if (referencesHeader) emailHeaders["References"] = referencesHeader.join(" ");
    }

    const emailResult = await sendEmail({
      from: `${fromName} <${fromAddress}>`,
      to: [body.to],
      subject: body.subject,
      html: body.body_html || "",
      text: body.body_text || undefined,
      headers: Object.keys(emailHeaders).length > 0 ? emailHeaders : undefined,
    });

    if (emailResult.error) {
      // Store as failed
      await supabase.from("mailbox_emails").insert({
        owner_id: userId,
        direction: "outbound",
        from_address: fromAddress,
        from_name: fromName,
        to_address: body.to,
        subject: body.subject,
        body_text: body.body_text || null,
        body_html: body.body_html || null,
        snippet: (body.body_text || "").slice(0, 200),
        status: "failed",
        folder: "sent",
        is_read: true,
        resend_status: emailResult.error,
        in_reply_to_email_id: body.in_reply_to_email_id || null,
        in_reply_to_header: inReplyToHeader || null,
        references_header: referencesHeader || null,
        thread_id: threadId || null,
        email_date: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ error: `Failed to send: ${emailResult.error}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Store sent copy
    const { data: sentEmail, error: insertError } = await supabase
      .from("mailbox_emails")
      .insert({
        owner_id: userId,
        direction: "outbound",
        from_address: fromAddress,
        from_name: fromName,
        to_address: body.to,
        subject: body.subject,
        body_text: body.body_text || null,
        body_html: body.body_html || null,
        snippet: (body.body_text || "").slice(0, 200),
        status: "delivered",
        folder: "sent",
        is_read: true,
        resend_id: emailResult.id || null,
        resend_status: "sent",
        in_reply_to_email_id: body.in_reply_to_email_id || null,
        in_reply_to_header: inReplyToHeader || null,
        references_header: referencesHeader || null,
        thread_id: threadId || null,
        email_date: new Date().toISOString(),
      })
      .select("id")
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        email_id: sentEmail?.id,
        resend_id: emailResult.id,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err) {
    console.error("send-mailbox-email error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
