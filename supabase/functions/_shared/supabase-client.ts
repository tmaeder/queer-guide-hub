import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const ALLOWED_ORIGINS = new Set<string>([
  'https://queer.guide',
  'https://www.queer.guide',
  'http://localhost:5173',
  'http://localhost:3000',
])

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Build CORS headers with origin validation.
 * Returns the request origin only if it's in the allowlist.
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') ?? ''
  return {
    ...baseCorsHeaders,
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
  }
}

/**
 * @deprecated Use getCorsHeaders(req) for origin-validated CORS.
 * This is kept temporarily for backward compatibility but will be removed.
 * All functions should migrate to getCorsHeaders(req).
 */
export const corsHeaders = {
  ...baseCorsHeaders,
  'Access-Control-Allow-Origin': 'https://queer.guide',
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

export function jsonResponse(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : corsHeaders), 'Content-Type': 'application/json' },
  })
}

export function errorResponse(message: string, status = 500, req?: Request): Response {
  return jsonResponse({ error: message, success: false }, status, req)
}

export function corsResponse(req?: Request): Response {
  return new Response('ok', { headers: req ? getCorsHeaders(req) : corsHeaders })
}

/**
 * Verify the request comes from an authenticated admin user OR an internal
 * service-role call (e.g. workflow-dispatcher, cron). Service role tokens are
 * recognised by matching SUPABASE_SERVICE_ROLE_KEY and are granted full access
 * without a user lookup.
 */
export async function requireAdmin(
  req: Request,
  serviceClient: SupabaseClient
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return errorResponse('Missing authorization header', 401, req)
  }

  const token = authHeader.replace('Bearer ', '')

  // Allow internal service-role invocations (workflow-dispatcher, cron, etc.)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (serviceRoleKey && token === serviceRoleKey) {
    return { userId: 'service-role' }
  }

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token)
  if (userError || !userData.user) {
    return errorResponse('Invalid authorization', 401, req)
  }

  const { data: roleData } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .single()

  if (!roleData) {
    return errorResponse('Admin access required', 403, req)
  }

  return { userId: userData.user.id }
}
