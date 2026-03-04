import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendEmail, isEmailConfigured } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface BulkEmailRequest {
  template_key: string;
  recipients: Array<{
    email: string;
    variables?: Record<string, string>;
  }>;
  global_variables?: Record<string, string>;
  is_test?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!isEmailConfigured()) {
    console.error('Email service not configured');
    return new Response(
      JSON.stringify({ error: 'Email service not configured' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Verify the user is authenticated and has admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Check if user has admin role
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin');

    if (roleError || !userRoles || userRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const requestData: BulkEmailRequest = await req.json();
    const { template_key, recipients, global_variables = {}, is_test = false } = requestData;

    console.log(`Processing bulk email request for template: ${template_key}, recipients: ${recipients.length}`);

    // Validate input
    if (!template_key || !recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: template_key and recipients' }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

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
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const results = [];
    const errors = [];

    // Process each recipient
    for (const recipient of recipients) {
      try {
        // Merge global variables with recipient-specific variables
        const variables = { ...global_variables, ...recipient.variables };

        // Replace variables in the template content
        let htmlContent = template.html_content;
        let textContent = template.text_content || '';
        let subject = template.subject;

        // Process template variables
        const templateVariables = Array.isArray(template.variables) ? template.variables : [];
        templateVariables.forEach((variable: any) => {
          const value = variables[variable.name] || `{{${variable.name}}}`;
          const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
          htmlContent = htmlContent.replace(regex, value);
          textContent = textContent.replace(regex, value);
          subject = subject.replace(regex, value);
        });

        // Add test prefix for test emails
        if (is_test) {
          subject = `[TEST] ${subject}`;
        }

        console.log(`Sending email with subject: "${subject}" to ${recipient.email}`);

        const emailResult = await sendEmail({
          from: "The Queer Guide <noreply@resend.dev>",
          to: [recipient.email],
          subject,
          html: htmlContent,
          text: textContent.trim() || undefined,
        });

        if (emailResult.error) {
          console.error('Email send error for', recipient.email, ':', emailResult.error);
          errors.push({
            email: recipient.email,
            error: emailResult.error,
          });
        } else {
          console.log('Email sent successfully to:', recipient.email);
          results.push({
            email: recipient.email,
            email_id: emailResult.id,
            status: 'sent'
          });

          if (!is_test) {
            await supabase
              .from('email_logs')
              .insert({
                template_key,
                recipient_email: recipient.email,
                subject,
                sent_at: new Date().toISOString(),
                resend_id: emailResult.id,
              })
              .catch(err => console.log('Failed to log email:', err));
          }
        }

        // Add a small delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error('Error sending email to', recipient.email, ':', error);
        errors.push({
          email: recipient.email,
          error: error.message || 'Failed to send email'
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Bulk email completed. Sent: ${results.length}, Failed: ${errors.length}`,
        results,
        errors,
        summary: {
          total: recipients.length,
          sent: results.length,
          failed: errors.length
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in send-bulk-email function:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An unexpected error occurred',
        details: error.toString() 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);