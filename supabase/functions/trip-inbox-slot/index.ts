/**
 * trip-inbox-slot — promotes a parsed trip_inbox_items row into a
 * reservations row. Also serves as the paste-fallback entrypoint when the
 * user pastes raw confirmation text instead of forwarding the email.
 *
 * Request shapes:
 *   { item_id: uuid }                 → slot existing parsed inbox item
 *   { trip_id: uuid, raw_text: text } → parse + create inbox item + (auto-slot if confident)
 *
 * Auth:
 *   - User JWT: scoped by RLS (must be trip member).
 *   - Service role: allowed (worker uses this for auto-slot path).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'
import { anthropicMessages } from '../_shared/anthropic-shim.ts'

interface SlotByItem { item_id: string }
interface SlotByPaste { trip_id: string; raw_text: string; subject?: string }

const SYSTEM_PROMPT = [
  'You are a strict JSON extractor for travel booking confirmation emails.',
  'Read the email and emit ONE JSON object with these fields:',
  '  type: "lodging"|"flight"|"rail"|"restaurant"|"activity"|"unknown"',
  '  vendor, title, start (ISO 8601), end (ISO 8601), location,',
  '  price (number), currency (ISO 4217), confirmation, confidence (0..1).',
  'Return JSON only — no prose, no markdown fences.',
].join('\n')

const ALLOWED_TYPES = new Set(['lodging','flight','rail','restaurant','activity','unknown'])

type ParsedBooking = {
  type: 'lodging'|'flight'|'rail'|'restaurant'|'activity'|'unknown'
  vendor: string | null
  title: string | null
  start: string | null
  end: string | null
  location: string | null
  price: number | null
  currency: string | null
  confirmation: string | null
  confidence: number
}

function parseLLMResponse(raw: string): ParsedBooking {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  let obj: Record<string, unknown> = {}
  try { obj = JSON.parse(cleaned) as Record<string, unknown> } catch { /* noop */ }
  const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim()) ? v.trim() : null
  const numOrNull = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && !isNaN(Number(v))) return Number(v)
    return null
  }
  const t = typeof obj.type === 'string' && ALLOWED_TYPES.has(obj.type)
    ? obj.type as ParsedBooking['type']
    : 'unknown'
  const conf = numOrNull(obj.confidence)
  return {
    type: t,
    vendor: strOrNull(obj.vendor),
    title: strOrNull(obj.title),
    start: strOrNull(obj.start),
    end: strOrNull(obj.end),
    location: strOrNull(obj.location),
    price: numOrNull(obj.price),
    currency: strOrNull(obj.currency),
    confirmation: strOrNull(obj.confirmation),
    confidence: conf === null ? 0 : Math.min(1, Math.max(0, conf)),
  }
}

const TYPE_TO_RES_TYPE: Record<ParsedBooking['type'], string> = {
  lodging: 'hotel',
  flight: 'flight',
  rail: 'transit',
  restaurant: 'restaurant',
  activity: 'activity',
  unknown: 'other',
}

async function slotItem(
  service: ReturnType<typeof getServiceClient>,
  itemId: string,
  ownerUserId: string,
): Promise<{ reservation_id: string } | { error: string; status: number }> {
  const { data: item, error: itemErr } = await service
    .from('trip_inbox_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle()
  if (itemErr) return { error: itemErr.message, status: 500 }
  if (!item) return { error: 'item_not_found', status: 404 }
  if (item.parse_status === 'slotted' && item.slotted_reservation_id) {
    return { reservation_id: item.slotted_reservation_id }
  }

  const resInsert = {
    user_id: ownerUserId,
    trip_id: item.trip_id,
    source: 'inbox',
    type: TYPE_TO_RES_TYPE[(item.parsed_type ?? 'unknown') as ParsedBooking['type']] ?? 'other',
    title: item.parsed_title || item.raw_subject || 'Forwarded booking',
    status: 'confirmed',
    start_at: item.parsed_start_at,
    end_at: item.parsed_end_at,
    provider: item.parsed_vendor,
    confirmation_code: item.parsed_confirmation,
    total_amount: item.parsed_price,
    currency: item.parsed_currency,
    notes: item.parsed_location ? `Location: ${item.parsed_location}` : null,
  }

  const { data: created, error: insErr } = await service
    .from('reservations')
    .insert(resInsert)
    .select('id')
    .single()
  if (insErr || !created) return { error: insErr?.message ?? 'insert_failed', status: 500 }

  await service
    .from('trip_inbox_items')
    .update({ parse_status: 'slotted', slotted_reservation_id: created.id })
    .eq('id', itemId)

  return { reservation_id: created.id }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405, req)

  const service = getServiceClient()

  // Identify caller. Service-role calls (from worker) come with the
  // service-role bearer. Otherwise we use the user's JWT to find their uid
  // and verify trip membership through RLS via a user-scoped client.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const isServiceRole = !!token && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  let userId: string | null = null
  if (!isServiceRole) {
    if (!token) return errorResponse('missing_auth', 401, req)
    const { data, error } = await service.auth.getUser(token)
    if (error || !data.user) return errorResponse('invalid_auth', 401, req)
    userId = data.user.id
  }

  const body = await req.json().catch(() => null) as SlotByItem | SlotByPaste | null
  if (!body) return errorResponse('invalid_body', 400, req)

  // Branch A: slot existing item.
  if ('item_id' in body && body.item_id) {
    // Owner for the reservation row: trip owner. We look it up.
    const { data: itemRow } = await service
      .from('trip_inbox_items')
      .select('trip_id')
      .eq('id', body.item_id)
      .maybeSingle()
    if (!itemRow) return errorResponse('item_not_found', 404, req)

    if (!isServiceRole) {
      // RLS-scoped read confirms the user can see the item (= trip member).
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      )
      const { data: visible } = await userClient
        .from('trip_inbox_items')
        .select('id')
        .eq('id', body.item_id)
        .maybeSingle()
      if (!visible) return errorResponse('forbidden', 403, req)
    }

    const { data: trip } = await service
      .from('trips')
      .select('owner_id')
      .eq('id', itemRow.trip_id)
      .single()
    const ownerUserId = isServiceRole ? trip!.owner_id : (userId ?? trip!.owner_id)

    const result = await slotItem(service, body.item_id, ownerUserId)
    if ('error' in result) return errorResponse(result.error, result.status, req)
    return jsonResponse({ success: true, ...result }, 200, req)
  }

  // Branch B: paste fallback — parse raw text, insert, optionally auto-slot.
  if ('raw_text' in body && body.raw_text && body.trip_id) {
    if (!isServiceRole) {
      // User must be member of trip; check via RLS-scoped read.
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      )
      const { data: trip } = await userClient
        .from('trips')
        .select('id')
        .eq('id', body.trip_id)
        .maybeSingle()
      if (!trip) return errorResponse('forbidden', 403, req)
    }

    let parsed: ParsedBooking | null = null
    let parseStatus: 'parsed' | 'failed' = 'parsed'
    try {
      const llm = await anthropicMessages({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `${body.subject ? `Subject: ${body.subject}\n\n` : ''}${body.raw_text.slice(0, 12000)}`,
        }],
      })
      parsed = parseLLMResponse(llm.content?.[0]?.text ?? '')
    } catch (err) {
      console.error('paste llm failed', err)
      parseStatus = 'failed'
    }

    const insert: Record<string, unknown> = {
      trip_id: body.trip_id,
      raw_subject: body.subject ?? null,
      raw_from: 'paste',
      parse_status: parseStatus,
    }
    if (parsed) {
      insert.parse_confidence = parsed.confidence
      insert.parsed_type = parsed.type
      insert.parsed_vendor = parsed.vendor
      insert.parsed_title = parsed.title
      insert.parsed_start_at = parsed.start
      insert.parsed_end_at = parsed.end
      insert.parsed_location = parsed.location
      insert.parsed_price = parsed.price
      insert.parsed_currency = parsed.currency
      insert.parsed_confirmation = parsed.confirmation
    }

    const { data: created, error: insErr } = await service
      .from('trip_inbox_items')
      .insert(insert)
      .select('id')
      .single()
    if (insErr || !created) return errorResponse(insErr?.message ?? 'insert_failed', 500, req)

    let reservationId: string | null = null
    if (parsed && parsed.confidence >= 0.85 && parsed.type !== 'unknown') {
      const { data: trip } = await service
        .from('trips')
        .select('owner_id')
        .eq('id', body.trip_id)
        .single()
      const ownerUserId = userId ?? trip!.owner_id
      const result = await slotItem(service, created.id, ownerUserId)
      if (!('error' in result)) reservationId = result.reservation_id
    }

    return jsonResponse({
      success: true,
      item_id: created.id,
      parse_status: parseStatus,
      auto_slotted: !!reservationId,
      reservation_id: reservationId,
    }, 200, req)
  }

  return errorResponse('invalid_body', 400, req)
})
