import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from '../_shared/supabase-client.ts';

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    return new Response('ok', { headers: cors });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const resend = resendApiKey ? new Resend(resendApiKey) : null;

  if (!resend) {
    console.error('RESEND_API_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'Email service not configured' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  }

  try {
    // Authenticate request: require valid JWT and admin role
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseWithAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabaseWithAuth.auth.getUser();
    if (authError || !authData?.user) {
      console.error("Unauthorized email send attempt", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    // Check admin role
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authData.user.id);
    const isAdmin = roles?.some((r: any) => r.role === 'admin');
    if (rolesError || !isAdmin) {
      console.warn("Forbidden: non-admin attempted to send templated email", { rolesError });
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    // Basic rate limiting (per user id)
    const ip = (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('cf-connecting-ip') ||
               req.headers.get('x-real-ip') ||
               "0.0.0.0");
    const identifier = authData.user.id || ip;
    const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      identifier,
      max_attempts: 100, // 100 emails/hour per admin user
      time_window_minutes: 60
    });
    if (rlError || allowed === false) {
      console.warn("Rate limit exceeded for send-templated-email", { identifier, rlError });
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        { status: 429, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    const requestData: SendEmailRequest = await req.json();
    const { template_key, to_email, variables, is_test = false } = requestData;

    console.log(`Processing email request for template: ${template_key}, recipient: ${to_email}`);

    // Fetch the email template from the database
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('template_key', template_key)
      .eq('is_active', true)
      .single();

    if (templateError || !template) {
      console.error('Template not found or inactive:', templateError);
      return new Response(
        JSON.stringify({ error: `Template '${template_key}' not found or inactive` }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...cors },
        }
      );
    }

    // Replace variables in the template content
    let htmlContent = template.html_content;
    let textContent = template.text_content || '';
    let subject = template.subject;

    // Process template variables
    const templateVariables = Array.isArray(template.variables) ? template.variables : [];
    templateVariables.forEach((variable: any) => {
      const value = variables[variable.name] || `{{${variable.name}}}`;
      const regex = new RegExp(`\\{\\{${escapeRegExp(variable.name)}\\}\\}`, 'g');
      htmlContent = htmlContent.replace(regex, escapeHtml(value));
      textContent = textContent.replace(regex, value);
      subject = subject.replace(regex, value);
    });

    // Add test prefix for test emails
    if (is_test) {
      subject = `[TEST] ${subject}`;
    }

    console.log(`Sending email with subject: "${subject}" to ${to_email}`);

    // Send the email using Resend
    const emailData: any = {
      from: "The Queer Guide <noreply@resend.dev>", // You can customize this
      to: [to_email],
      subject: subject,
      html: htmlContent,
    };

    // Add text content if available
    if (textContent.trim()) {
      emailData.text = textContent;
    }

    const emailResponse = await resend.emails.send(emailData);

    if (emailResponse.error) {
      console.error('Resend error:', emailResponse.error);
      throw new Error(emailResponse.error.message || 'Failed to send email');
    }

    console.log('Email sent successfully:', emailResponse.data);

    // Log the email send for tracking (optional)
    if (!is_test) {
      await supabase
        .from('email_logs') // You could create this table for tracking
        .insert({
          template_key,
          recipient_email: to_email,
          subject,
          sent_at: new Date().toISOString(),
          resend_id: emailResponse.data?.id,
        })
        .catch(err => console.log('Failed to log email:', err)); // Non-blocking
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Email sent successfully to ${to_email}`,
        email_id: emailResponse.data?.id 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );

  } catch (error: any) {
    console.error("Error in send-templated-email function:", error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  }
};

serve(handler);