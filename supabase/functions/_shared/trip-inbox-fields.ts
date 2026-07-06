/**
 * Pure helpers for the trip-inbox conversational loop: parsing + whitelist
 * validation of the assistant's ```fields fenced block. Kept dependency-free
 * so it unit-tests without any Supabase/LLM plumbing.
 *
 * Security contract: the assistant output is derived from attacker-influenced
 * email content, so NOTHING outside this whitelist may reach the DB — and
 * parse_status / slotted_reservation_id / parse_confidence are never part of
 * the whitelist.
 */

export const ALLOWED_TYPES = new Set([
  'lodging',
  'flight',
  'rail',
  'restaurant',
  'activity',
  'unknown',
])

export type ProposedFields = {
  type?: string
  vendor?: string | null
  title?: string | null
  start?: string | null
  end?: string | null
  location?: string | null
  price?: number | null
  currency?: string | null
  confirmation?: string | null
}

const strOrNull = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null

const isoOrNull = (v: unknown) => {
  const s = strOrNull(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const numOrNull = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && !isNaN(Number(v))) return Number(v)
  return null
}

/**
 * Split an assistant reply into prose + validated field updates.
 * Returns fields:null when there is no fence, the JSON is malformed, or
 * nothing in it survives validation. The fence is always stripped from reply.
 */
export function parseProposedFields(text: string): {
  fields: ProposedFields | null
  reply: string
} {
  const fence = text.match(/```fields\s*([\s\S]*?)```/)
  if (!fence) return { fields: null, reply: text.trim() }
  const reply = text.replace(fence[0], '').trim()
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(fence[1].trim()) as Record<string, unknown>
  } catch {
    return { fields: null, reply }
  }
  const fields: ProposedFields = {}
  if (typeof obj.type === 'string' && ALLOWED_TYPES.has(obj.type)) fields.type = obj.type
  if ('vendor' in obj) fields.vendor = strOrNull(obj.vendor)
  if ('title' in obj) fields.title = strOrNull(obj.title)
  if ('start' in obj) fields.start = isoOrNull(obj.start)
  if ('end' in obj) fields.end = isoOrNull(obj.end)
  if ('location' in obj) fields.location = strOrNull(obj.location)
  if ('price' in obj) fields.price = numOrNull(obj.price)
  if ('currency' in obj) {
    const c = strOrNull(obj.currency)
    fields.currency = c && /^[A-Za-z]{3}$/.test(c) ? c.toUpperCase() : null
  }
  if ('confirmation' in obj) fields.confirmation = strOrNull(obj.confirmation)
  return { fields: Object.keys(fields).length ? fields : null, reply }
}
