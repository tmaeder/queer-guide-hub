import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

// Origin-validated CORS (mirrors _shared/supabase-client.ts; inlined so the
// function deploys as a self-contained bundle).
const ALLOWED_ORIGINS = new Set<string>([
  'https://queer.guide',
  'https://www.queer.guide',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
])
function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
  }
}

// GDPR Art. 20 / Swiss nFADP data portability.
// Self-only: returns everything we hold about the caller (special-category
// intimate free-text decrypted) as a JSON document. The client turns it into a
// downloadable file.
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const admin = createClient(url, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)
    const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: allowed } = await admin.rpc('check_rate_limit', {
      identifier: user.id,
      max_attempts: 5,
      time_window_minutes: 60,
    })
    if (allowed === false) return json({ error: 'Too many requests' }, 429)

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data, error: rpcErr } = await userClient.rpc('export_my_data', { p_user_id: user.id })
    if (rpcErr) {
      console.error('export_my_data failed', rpcErr)
      return json({ error: 'Export failed' }, 500)
    }

    const { data: objects } = await userClient.rpc('list_my_storage_objects', { p_user_id: user.id })

    const payload = {
      manifest: {
        generated_at: new Date().toISOString(),
        user_id: user.id,
        app: 'queer.guide',
        schema_version: 1,
      },
      account: { email: user.email, created_at: user.created_at },
      data,
      files: objects ?? [],
    }

    await admin.rpc('log_enhanced_security_event', {
      p_event_type: 'DATA_EXPORTED',
      p_user_id: user.id,
      p_details: {},
      p_severity: 'info',
    }).then(undefined, () => {})

    return json(payload, 200)
  } catch (e) {
    console.error('export-my-data error', e)
    return json({ error: 'Internal server error' }, 500)
  }
})
