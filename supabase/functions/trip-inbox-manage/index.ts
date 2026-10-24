import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireAdmin } from '../_shared/supabase-client.ts'
import { InboxRouting, RoutingError } from '../_shared/trip-inbox-routing.ts'
import { checkUserRateLimit } from '../_shared/user-rate-limit.ts'

const fields = 'id, trip_id, short_id, revoked_at, created_at, routing_status, routing_rule_id'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function randomShortId(): string {
  // 96 bits of entropy. Identifiers are generated only by the server.
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405, req)
  const service = getServiceClient()
  const body = await req.json().catch(() => null)
  const action = body?.action ?? 'enable'
  if (!['enable', 'revoke', 'regenerate', 'reconcile', 'status'].includes(action)) return errorResponse('invalid_action', 400, req)
  let userId: string | undefined
  if (action === 'reconcile' || action === 'status') {
    const auth = await requireAdmin(req, service)
    if (auth instanceof Response) return auth
  } else {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data, error } = await service.auth.getUser(token)
    if (error || !data.user) return errorResponse('invalid_auth', 401, req)
    userId = data.user.id
    if (!uuid.test(body?.trip_id ?? '')) return errorResponse('invalid_trip', 400, req)
    const permission = await service.rpc('can_edit_trip', { p_trip_id: body.trip_id, p_user_id: userId })
    if (permission.error || permission.data !== true) return errorResponse('forbidden', 403, req)
    if (!(await checkUserRateLimit(req, 'trip-inbox-manage', 30, 3600))) return errorResponse('rate_limited', 429, req)
  }
  try {
    const routing = new InboxRouting(
      Deno.env.get('TRIP_INBOX_ROUTING_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN') || '',
      Deno.env.get('CLOUDFLARE_ZONE_ID') || 'fe9b9da8a08af32e10bb3ba7fdb04440',
    )
    if (action === 'status') {
      const config = {
        zone_id: Deno.env.get('CLOUDFLARE_ZONE_ID') || 'fe9b9da8a08af32e10bb3ba7fdb04440',
        dedicated_token_configured: Boolean(Deno.env.get('TRIP_INBOX_ROUTING_API_TOKEN')),
      }
      try {
        return jsonResponse({ ...config, configured: true, rule_count: (await routing.list()).length }, 200, req)
      } catch (error) {
        return jsonResponse({ ...config, configured: false, error: error instanceof RoutingError ? error.message : 'Provider unavailable' }, 503, req)
      }
    }

    async function provision(inbox: { id: string; short_id: string }) {
      try {
        const ruleId = await routing.ensure(inbox.short_id)
        const result = await service.from('trip_inboxes').update({ routing_status: 'ready', routing_rule_id: ruleId })
          .eq('id', inbox.id).is('revoked_at', null).select(fields).maybeSingle()
        if (result.error) throw result.error
        if (!result.data) {
          // Revocation may race an in-flight provision. Never reactivate the row.
          await routing.remove(inbox.short_id)
          throw new RoutingError('Inbox was revoked while routing was being configured')
        }
        return result.data
      } catch (error) {
        await service.from('trip_inboxes').update({ routing_status: 'failed' }).eq('id', inbox.id).is('revoked_at', null)
        throw error
      }
    }
    async function cleanup(inbox: { id: string; short_id: string }) {
      await routing.remove(inbox.short_id)
      const { error } = await service.from('trip_inboxes').update({ routing_rule_id: null, routing_status: 'revoked' })
        .eq('id', inbox.id).not('revoked_at', 'is', null)
      if (error) throw error
    }
    if (action === 'reconcile') {
      // Keyset pagination: no silent truncation at the Data API row limit.
      const results: { id: string; status: string }[] = []
      let cursor = ''
      while (true) {
        let query = service.from('trip_inboxes').select(fields).order('id').limit(100)
        if (cursor) query = query.gt('id', cursor)
        const { data, error } = await query
        if (error) throw error
        for (const inbox of data ?? []) {
          try {
            if (inbox.revoked_at) await cleanup(inbox)
            else await provision(inbox)
            results.push({ id: inbox.id, status: inbox.revoked_at ? 'revoked' : 'ready' })
          } catch {
            results.push({ id: inbox.id, status: 'failed' })
          }
        }
        if (!data?.length || data.length < 100) break
        cursor = data[data.length - 1].id
      }
      return jsonResponse({ success: !results.some(r => r.status === 'failed'), results }, 200, req)
    }
    if (action === 'revoke' || action === 'regenerate') {
      // Persist revocation before touching the external provider. The mail
      // Worker checks revoked_at, including if provider cleanup fails.
      const revoked = await service.from('trip_inboxes').update({ revoked_at: new Date().toISOString(), routing_status: 'revoked' })
        .eq('trip_id', body.trip_id).is('revoked_at', null).select(fields)
      if (revoked.error) throw revoked.error
      const allRevoked = await service.from('trip_inboxes').select(fields).eq('trip_id', body.trip_id).not('revoked_at', 'is', null)
      if (allRevoked.error) throw allRevoked.error
      for (const inbox of allRevoked.data ?? []) await cleanup(inbox)
      if (action === 'revoke') return jsonResponse({ success: true }, 200, req)
    }
    const existing = await service.from('trip_inboxes').select(fields).eq('trip_id', body.trip_id).is('revoked_at', null).maybeSingle()
    if (existing.error) throw existing.error
    let inbox = existing.data
    if (!inbox) {
      const inserted = await service.from('trip_inboxes').insert({ trip_id: body.trip_id, short_id: randomShortId(), created_by: userId, routing_status: 'pending' }).select(fields).single()
      if (inserted.error?.code === '23505') {
        const raced = await service.from('trip_inboxes').select(fields).eq('trip_id', body.trip_id).is('revoked_at', null).single()
        if (raced.error) throw raced.error
        inbox = raced.data
      } else {
        if (inserted.error) throw inserted.error
        inbox = inserted.data
      }
    }
    return jsonResponse({ inbox: await provision(inbox!) }, 200, req)
  } catch (error) {
    console.error('trip-inbox-manage failed', error instanceof RoutingError ? error.message : 'database or network error')
    return errorResponse(error instanceof RoutingError ? error.message : 'Unable to configure the trip inbox. Please retry.', 503, req)
  }
})
