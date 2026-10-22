import { renderEmailTemplate } from "../_shared/email-render.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { isEmailConfigured, sendEmail } from "../_shared/email.ts";
import { fromHeader, getEmailBranding, wrapHtml } from "../_shared/branding.ts";
import { getCorsHeaders } from "../_shared/supabase-client.ts";
import { takeEmailQuota } from "./rate-limit.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SendEmailRequest {
  template_key: string;
  to_email: string;
  variables: Record<string, string>;
  is_test?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (!isEmailConfigured()) {
    console.error("Email service not configured");
    return new Response(
      JSON.stringify({ error: "Email service not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      },
    );
  }

  try {
    // Authenticate request: require valid JWT and admin role
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseWithAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabaseWithAuth.auth
      .getUser();
    if (authError || !authData?.user) {
      console.error("Unauthorized email send attempt", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...cors },
        },
      );
    }

    // Check admin role
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id);
    const isAdmin = roles?.some((r: Record<string, unknown>) =>
      r.role === "admin"
    );
    if (rolesError || !isAdmin) {
      console.warn("Forbidden: non-admin attempted to send templated email", {
        rolesError,
      });
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...cors },
        },
      );
    }

    const quota = await takeEmailQuota(
      (name, args) => supabase.rpc(name, args),
      authData.user.id,
    );
    if (quota === "unavailable") {
      return new Response(
        JSON.stringify({
          error: "Email sending limit is temporarily unavailable. Try again.",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json", ...cors },
        },
      );
    }
    if (quota === "limited") {
      console.warn("Rate limit exceeded for send-templated-email");
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", ...cors },
        },
      );
    }

    const requestData: SendEmailRequest = await req.json();
    const { template_key, to_email, variables, is_test = false } = requestData;

    // This endpoint is an interactive template test, never a campaign transport.
    // Restrict it to the verified operator mailbox; production messages require
    // their domain producer and its authoritative purpose/source checks.
    if (
      is_test !== true || typeof to_email !== "string" ||
      to_email.trim().toLowerCase() !==
        authData.user.email?.trim().toLowerCase()
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Template tests can only be sent to your verified admin email. Production messages require an operational producer.",
        }),
        {
          status: 403,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch the email template from the database
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("template_key", template_key)
      .eq("is_active", true)
      .single();

    if (templateError || !template) {
      console.error("Template not found or inactive:", templateError);
      return new Response(
        JSON.stringify({
          error: `Template '${template_key}' not found or inactive`,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...cors },
        },
      );
    }

    let rendered;
    try {
      rendered = renderEmailTemplate(template, variables ?? {});
    } catch {
      return new Response(
        JSON.stringify({
          error: "Template variables are invalid or incomplete",
        }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }
    const htmlContent = rendered.html, textContent = rendered.text;
    let subject = rendered.subject;

    // Add test prefix for test emails
    if (is_test) {
      subject = `[TEST] ${subject}`;
    }

    const branding = await getEmailBranding();
    const emailResult = await sendEmail({
      templateKey: template_key,
      from: fromHeader(branding),
      to: [to_email],
      subject,
      html: wrapHtml(htmlContent, branding),
      text: textContent.trim() || undefined,
    });

    if (emailResult.error) {
      console.error("Email send error:", emailResult.error);
      throw new Error(emailResult.error);
    }

    console.log("Email sent successfully:", emailResult.id);

    // The shared outbox is the durable delivery log for both tests and production.

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email accepted for delivery to ${to_email}`,
        email_id: emailResult.id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...cors },
      },
    );
  } catch (error: unknown) {
    console.error("Error in send-templated-email function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      },
    );
  }
};

Deno.serve(handler);
