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

// GDPR Art. 17 / Swiss nFADP right to erasure.
// Self-only: the caller can delete only their own account. Requires a re-typed
// username (or email) confirmation. Runs the atomic table deletes as the user
// (delete_my_account RPC, auth.uid() guard), purges the user's storage objects,
// writes a personal-data-free audit row, then deletes the auth user.
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const admin = createClient(url, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // Confirmation: the user must re-type their username (or email).
    let body: { confirmation?: string } = {}
    try { body = await req.json() } catch { /* empty body */ }
    const confirmation = (body.confirmation ?? '').trim()
    if (!confirmation) return json({ error: 'Confirmation required' }, 400)

    const { data: profile } = await admin
      .from('profiles')
      .select('username')
      .eq('user_id', user.id)
      .maybeSingle()
    const expected = (profile?.username ?? user.email ?? '').trim()
    if (!expected || confirmation.toLowerCase() !== expected.toLowerCase()) {
      return json({ error: 'Confirmation does not match' }, 400)
    }

    // Rate limit (non-blocking if the RPC is unavailable; only an explicit
    // `false` blocks).
    const { data: allowed } = await admin.rpc('check_rate_limit', {
      identifier: user.id,
      max_attempts: 3,
      time_window_minutes: 60,
    })
    if (allowed === false) return json({ error: 'Too many requests' }, 429)

    // User-scoped client so auth.uid() inside the RPCs resolves to the caller.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Capture storage objects to purge BEFORE removing the auth user.
    const { data: objects } = await userClient.rpc('list_my_storage_objects', {
      p_user_id: user.id,
    })

    // Atomic table erasure.
    const { data: counts, error: delError } = await userClient.rpc('delete_my_account', {
      p_user_id: user.id,
    })
    if (delError) {
      console.error('delete_my_account failed', delError)
      return json({ error: 'Deletion failed' }, 500)
    }

    // Purge storage binaries (storage rows have no FK, so the cascade misses them).
    let storageRemoved = 0
    if (Array.isArray(objects) && objects.length) {
      const byBucket: Record<string, string[]> = {}
      for (const o of objects as { bucket_id: string; name: string }[]) {
        (byBucket[o.bucket_id] ??= []).push(o.name)
      }
      for (const [bucket, names] of Object.entries(byBucket)) {
        const { error } = await admin.storage.from(bucket).remove(names)
        if (!error) storageRemoved += names.length
      }
    }

    // Proof-of-deletion audit (contains no personal data).
    await admin.rpc('log_enhanced_security_event', {
      p_event_type: 'ACCOUNT_SELF_DELETED',
      p_user_id: user.id,
      p_details: { counts, storage_removed: storageRemoved },
      p_severity: 'warning',
    }).then(undefined, () => {})

    // Remove the auth user (cascade is now a no-op safety net).
    const { error: authDelError } = await admin.auth.admin.deleteUser(user.id)
    if (authDelError) {
      console.error('auth deleteUser failed', authDelError)
      return json({ error: 'Account data removed but final deletion failed; please contact support' }, 500)
    }

    return json({ success: true })
  } catch (e) {
    console.error('delete-account error', e)
    return json({ error: 'Internal server error' }, 500)
  }
})
