/**
 * twenty-inbound — receives Twenty CRM webhooks (company/person updated) and turns
 * each edit into a PENDING proposal in `twenty_inbound_review`. Edits NEVER touch
 * public content directly; an admin approves and only whitelisted safe fields are
 * applied (see migration 20260715183310_twenty_inbound_review.sql).
 *
 * Auth: verify_jwt=false; gated by a shared secret in the `?token=` query param
 * (set when registering the webhook) matching env TWENTY_WEBHOOK_SECRET.
 */
import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Twenty field → source column, per entity. ONLY these are ever proposed.
const MAP = {
  organization: {
    name: 'name', qgDescription: 'description', qgEditorialHook: 'editorial_hook',
    qgEditorialLong: 'editorial_long', qgEmail: 'email', qgPhone: 'phone',
    qgWebsite: 'website', qgLogoUrl: 'logo_url',
  },
  merchant: { name: 'display_name' },
  contact: { name: 'name', qgCategory: 'category' },
} as const

const TABLE = {
  organization: 'organizations',
  merchant: 'marketplace_merchants',
  contact: 'contact_submissions',
} as const

type Entity = keyof typeof MAP

/** Twenty composites → plain string for comparison. */
function twentyValue(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('primaryLinkUrl' in o) return (o.primaryLinkUrl as string) || null
    if ('firstName' in o || 'lastName' in o) {
      return [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || null
    }
    if ('primaryEmail' in o) return (o.primaryEmail as string) || null
  }
  return String(v)
}

Deno.serve(withErrorReporting('twenty-inbound', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const url = new URL(req.url)
  const expected = Deno.env.get('TWENTY_WEBHOOK_SECRET')
  if (!expected || url.searchParams.get('token') !== expected) {
    return errorResponse('unauthorized', 401, req)
  }

  const supabase = getServiceClient()
  const payload = await req.json().catch(() => ({})) as Record<string, any>
  // Twenty sends { eventName, record, ... }. record holds the object incl. externalId.
  const record = payload.record ?? payload.data?.record ?? payload
  const externalId: string | undefined = record?.externalId
  const twentyId: string | undefined = record?.id
  if (!externalId || !externalId.includes(':')) {
    return jsonResponse({ success: true, skipped: 'no-externalId' }, 200, req)
  }

  const [prefix, entityId] = externalId.split(':', 2)
  const entity = ({ org: 'organization', merchant: 'merchant', contact: 'contact' } as const)[
    prefix as 'org' | 'merchant' | 'contact'
  ]
  if (!entity) return jsonResponse({ success: true, skipped: 'unknown-prefix' }, 200, req)

  const map = MAP[entity as Entity]
  const cols = Object.values(map)

  // current source values
  const { data: cur, error } = await supabase
    .from(TABLE[entity as Entity])
    .select(cols.join(', '))
    .eq('id', entityId)
    .maybeSingle()
  if (error) throw new Error(`${entity} fetch: ${error.message}`)
  if (!cur) return jsonResponse({ success: true, skipped: 'entity-missing' }, 200, req)

  // diff whitelisted fields (Twenty value vs source value)
  const changes: Record<string, { from: unknown; to: string | null }> = {}
  for (const [twField, col] of Object.entries(map)) {
    const to = twentyValue(record[twField])
    const from = (cur as Record<string, unknown>)[col] ?? null
    if (to !== null && String(from ?? '') !== to) {
      changes[col] = { from, to }
    }
  }

  if (Object.keys(changes).length === 0) {
    return jsonResponse({ success: true, changes: 0 }, 200, req)
  }

  // refresh the single pending proposal for this entity
  await supabase.from('twenty_inbound_review')
    .delete().eq('entity_type', entity).eq('entity_id', entityId).eq('status', 'pending')
  const { error: insErr } = await supabase.from('twenty_inbound_review').insert({
    entity_type: entity, entity_id: entityId, external_id: externalId,
    twenty_record_id: twentyId ?? null, changes,
  })
  if (insErr) throw new Error(`insert review: ${insErr.message}`)

  return jsonResponse({ success: true, entity, changes: Object.keys(changes) }, 200, req)
}))
