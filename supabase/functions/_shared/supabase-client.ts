import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

export function getAnonClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message, success: false }, status)
}

export function corsResponse(): Response {
  return new Response('ok', { headers: corsHeaders })
}

/**
 * Verify the request comes from an authenticated admin user.
 * Returns the user ID on success, or a Response to return on failure.
 */
export async function requireAdmin(
  req: Request,
  serviceClient: SupabaseClient
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return errorResponse('Missing authorization header', 401)
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: userError } = await serviceClient.auth.getUser(token)
  if (userError || !userData.user) {
    return errorResponse('Invalid authorization', 401)
  }

  const { data: roleData } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .single()

  if (!roleData) {
    return errorResponse('Admin access required', 403)
  }

  return { userId: userData.user.id }
}
