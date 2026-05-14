import { sendEmail, isEmailConfigured } from "../_shared/email.ts";
import { getCorsHeaders, getServiceClient } from '../_shared/supabase-client.ts';

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const supabase = getServiceClient();

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
  const cors = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response('ok', { headers: cors });
  }

  if (!isEmailConfigured()) {
    console.error('Email service not configured');
    return new Response(
      JSON.stringify({ error: 'Email service not configured' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
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
          headers: { "Content-Type": "application/json", ...cors },
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
          headers: { "Content-Type": "application/json", ...cors },
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
          headers: { "Content-Type": "application/json", ...cors },
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
          headers: { "Content-Type": "application/json", ...cors },
        }
      );
    }

    if (recipients.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Recipient count exceeds maximum of 500' }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors },
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
          headers: { "Content-Type": "application/json", ...cors },
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
        templateVariables.forEach((variable: Record<string, unknown>) => {
          const value = variables[variable.name] || `{{${variable.name}}}`;
          const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
          htmlContent = htmlContent.replace(regex, escapeHtml(value));
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

      } catch (error: unknown) {
        console.error('Error sending email to', recipient.email, ':', error);
        errors.push({
          email: recipient.email,
          error: 'Failed to send email'
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
        headers: { "Content-Type": "application/json", ...cors },
      }
    );

  } catch (error: unknown) {
    console.error("Error in send-bulk-email function:", error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  }
};

Deno.serve(handler);