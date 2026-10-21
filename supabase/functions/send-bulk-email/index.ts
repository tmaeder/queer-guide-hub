import { isEmailConfigured } from "../_shared/email.ts";
import { getCorsHeaders, getServiceClient } from '../_shared/supabase-client.ts';

const supabase = getServiceClient();

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

    return new Response(JSON.stringify({
      error: 'cloudflare_transactional_only',
      message: 'Cloudflare does not support marketing or newsletter dispatch. Use event-specific transactional email flows.',
    }), { status: 409, headers: { 'Content-Type': 'application/json', ...cors } });

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