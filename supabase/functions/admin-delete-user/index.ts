import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

// Origin-validated CORS (mirrors delete-account; inlined so the function
// deploys as a self-contained bundle).
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

// Admin-initiated account removal — the counterpart to `delete-account`, which
// is self-only.
//
// Why an edge function at all: SQL cannot finish this job. `admin_delete_user`
// clears the tables, but the user's storage objects have no FK so nothing
// cascades to them, and the `auth.users` row lives in a schema the RPC does not
// own. Both need the admin API. This is the same three-step shape delete-account
// uses, and the ORDER matters — enumerate storage BEFORE the row disappears,
// because the enumeration is driven by the profile.
//
// `mode` picks the action:
//   'delete'    — full erasure (tables, storage, auth user).
//   'anonymize' — strip the profile to a tombstone, keep the account.
//                 Storage is still purged: an avatar or a photo is personal
//                 data and survives the column scrub otherwise.
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
    const { data: { user: caller }, error: authError } = await admin.auth.getUser(token)
    if (authError || !caller) return json({ error: 'Unauthorized' }, 401)

    let body: { user_id?: string; mode?: string; reason?: string; confirmation?: string } = {}
    try { body = await req.json() } catch { /* empty body */ }

    const targetId = (body.user_id ?? '').trim()
    const mode = (body.mode ?? 'delete').trim()
    const reason = (body.reason ?? '').trim() || null
    if (!targetId) return json({ error: 'user_id is required' }, 400)
    if (mode !== 'delete' && mode !== 'anonymize') {
      return json({ error: "mode must be 'delete' or 'anonymize'" }, 400)
    }

    // Typed confirmation, as the self-serve path demands. The admin re-types
    // the target's username (or email) — the same friction, for a destructive
    // action performed on someone ELSE's account.
    const { data: profile } = await admin
      .from('profiles')
      .select('username, email')
      .eq('user_id', targetId)
      .maybeSingle()
    if (!profile) return json({ error: 'No profile for that user' }, 404)

    const expected = (profile.username ?? profile.email ?? '').trim()
    const confirmation = (body.confirmation ?? '').trim()
    if (!expected) return json({ error: 'Target has no username or email to confirm against' }, 409)
    if (confirmation.toLowerCase() !== expected.toLowerCase()) {
      return json({ error: 'Confirmation does not match' }, 400)
    }

    // Caller-scoped client so auth.uid() resolves to the ADMIN inside the RPC.
    // assert_admin_or_internal() is what authorizes this; the service-role
    // client above is used only for the parts SQL cannot do. Calling the RPC
    // with the service key would bypass the role check entirely and stamp a
    // null actor on the audit row.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Enumerate storage BEFORE the profile row goes away — for 'delete' the
    // row is the handle the enumeration hangs off.
    const { data: objects } = await admin.rpc('list_my_storage_objects', { p_user_id: targetId })

    const rpc = mode === 'delete' ? 'admin_delete_user' : 'admin_anonymize_user'
    const { data: result, error: rpcError } = await userClient.rpc(rpc, {
      p_user_id: targetId,
      p_reason: reason,
    })
    if (rpcError) {
      console.error(`${rpc} failed`, rpcError)
      // The RPC's own guards (not an admin, target holds admin, self-delete)
      // are the interesting failures — pass the message through so the console
      // can say WHY rather than "failed".
      const status = rpcError.code === '42501' ? 403 : 500
      return json({ error: rpcError.message ?? 'Operation failed' }, status)
    }

    // Purge storage binaries. Storage rows have no FK, so nothing above
    // reaches them.
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

    // Personal-data-free security event, mirroring ACCOUNT_SELF_DELETED.
    await admin.rpc('log_enhanced_security_event', {
      p_event_type: mode === 'delete' ? 'ACCOUNT_ADMIN_DELETED' : 'ACCOUNT_ADMIN_ANONYMIZED',
      p_user_id: caller.id,
      p_details: { target_user_id: targetId, result, storage_removed: storageRemoved },
      p_severity: 'warning',
    }).then(undefined, () => {})

    if (mode === 'anonymize') {
      return json({ success: true, mode, storage_removed: storageRemoved, result })
    }

    // Remove the auth user last. The tables are already clear, so the cascade
    // is a no-op safety net.
    const { error: authDelError } = await admin.auth.admin.deleteUser(targetId)
    if (authDelError) {
      console.error('auth deleteUser failed', authDelError)
      return json({
        error: 'Account data removed but the auth user could not be deleted; it must be removed by hand',
        storage_removed: storageRemoved,
      }, 500)
    }

    return json({ success: true, mode, storage_removed: storageRemoved, result })
  } catch (e) {
    console.error('admin-delete-user error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
