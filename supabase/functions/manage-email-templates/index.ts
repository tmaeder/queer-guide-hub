import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

interface EmailTemplateRequest {
  template_key?: string;
  name?: string;
  subject?: string;
  html_content?: string;
  text_content?: string;
  description?: string;
  variables?: Array<{name: string, description?: string, required?: boolean}>;
  is_active?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const url = new URL(req.url);
    const templateId = url.searchParams.get('id');
    const method = req.method;

    // Handle different HTTP methods
    switch (method) {
      case 'GET':
        return await handleGet(req, supabase, templateId);
      case 'POST':
        return await handlePost(req, supabase, (auth as { userId: string }).userId);
      case 'PUT':
        return await handlePut(req, supabase, templateId, (auth as { userId: string }).userId);
      case 'DELETE':
        return await handleDelete(req, supabase, templateId);
      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          {
            status: 405,
            headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
          }
        );
    }

  } catch (error: any) {
    console.error("Error in manage-email-templates function:", error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error'
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }
};

async function handleGet(req: Request, supabase: any, templateId: string | null): Promise<Response> {
  if (templateId) {
    // Get single template
    const { data: template, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Template not found' }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    }

    return new Response(
      JSON.stringify({ template }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  } else {
    // Get all templates
    const { data: templates, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({ templates }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }
}

async function handlePost(req: Request, supabase: any, userId: string): Promise<Response> {
  const templateData: EmailTemplateRequest = await req.json();

  // Validate required fields
  if (!templateData.template_key || !templateData.name || !templateData.subject || !templateData.html_content) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: template_key, name, subject, html_content' }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }

  // Validate template_key uniqueness
  const { data: existingTemplate } = await supabase
    .from('email_templates')
    .select('id')
    .eq('template_key', templateData.template_key)
    .single();

  if (existingTemplate) {
    return new Response(
      JSON.stringify({ error: 'Template key already exists' }),
      {
        status: 409,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }

  // Insert new template
  const { data: newTemplate, error } = await supabase
    .from('email_templates')
    .insert({
      template_key: templateData.template_key,
      name: templateData.name,
      subject: templateData.subject,
      html_content: templateData.html_content,
      text_content: templateData.text_content || '',
      description: templateData.description,
      variables: templateData.variables || [],
      is_active: templateData.is_active !== undefined ? templateData.is_active : true,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return new Response(
    JSON.stringify({
      message: 'Template created successfully',
      template: newTemplate
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    }
  );
}

async function handlePut(req: Request, supabase: any, templateId: string | null, userId: string): Promise<Response> {
  if (!templateId) {
    return new Response(
      JSON.stringify({ error: 'Template ID required for update' }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }

  const templateData: EmailTemplateRequest = await req.json();

  // Check if template exists
  const { data: existingTemplate, error: fetchError } = await supabase
    .from('email_templates')
    .select('id, template_key')
    .eq('id', templateId)
    .single();

  if (fetchError || !existingTemplate) {
    return new Response(
      JSON.stringify({ error: 'Template not found' }),
      {
        status: 404,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }

  // Validate template_key uniqueness if it's being changed
  if (templateData.template_key && templateData.template_key !== existingTemplate.template_key) {
    const { data: duplicateTemplate } = await supabase
      .from('email_templates')
      .select('id')
      .eq('template_key', templateData.template_key)
      .neq('id', templateId)
      .single();

    if (duplicateTemplate) {
      return new Response(
        JSON.stringify({ error: 'Template key already exists' }),
        {
          status: 409,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    }
  }

  // Update template
  const updateData: any = {
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  // Only update provided fields
  if (templateData.template_key) updateData.template_key = templateData.template_key;
  if (templateData.name) updateData.name = templateData.name;
  if (templateData.subject) updateData.subject = templateData.subject;
  if (templateData.html_content) updateData.html_content = templateData.html_content;
  if (templateData.text_content !== undefined) updateData.text_content = templateData.text_content;
  if (templateData.description !== undefined) updateData.description = templateData.description;
  if (templateData.variables) updateData.variables = templateData.variables;
  if (templateData.is_active !== undefined) updateData.is_active = templateData.is_active;

  const { data: updatedTemplate, error } = await supabase
    .from('email_templates')
    .update(updateData)
    .eq('id', templateId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return new Response(
    JSON.stringify({
      message: 'Template updated successfully',
      template: updatedTemplate
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    }
  );
}

async function handleDelete(req: Request, supabase: any, templateId: string | null): Promise<Response> {
  if (!templateId) {
    return new Response(
      JSON.stringify({ error: 'Template ID required for deletion' }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }

  // Check if template exists
  const { data: existingTemplate, error: fetchError } = await supabase
    .from('email_templates')
    .select('id')
    .eq('id', templateId)
    .single();

  if (fetchError || !existingTemplate) {
    return new Response(
      JSON.stringify({ error: 'Template not found' }),
      {
        status: 404,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }

  // Delete template
  const { error } = await supabase
    .from('email_templates')
    .delete()
    .eq('id', templateId);

  if (error) {
    throw error;
  }

  return new Response(
    JSON.stringify({ message: 'Template deleted successfully' }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    }
  );
}

serve(handler);
