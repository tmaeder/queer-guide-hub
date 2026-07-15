/**
 * Thin client for the Twenty CRM REST Core API.
 *
 * Twenty (twentyhq/twenty) is run as a SEPARATE self-hosted service. queer.guide
 * is a one-way upstream: we push a subset of `organizations`, `marketplace_merchants`
 * and `contact_submissions` into Twenty as Company / Person records. Twenty is the
 * downstream consumer — it never backs the public site.
 *
 * Idempotency is keyed on a Twenty-side custom TEXT field `externalId` (namespaced,
 * e.g. `org:<uuid>`, `merchant:<uuid>`, `contact:<uuid>`), so this side stores no
 * cursor and holds no Twenty ids — the sync is stateless and safe to re-run.
 *
 * Required Twenty setup (once, in Settings → Data Model): add a custom TEXT field
 * `externalId` to both the Company and Person objects. See
 * docs/integrations/twenty-crm-sync.md.
 *
 * Env (set via `supabase secrets set`):
 *   TWENTY_API_URL  — base origin, e.g. https://crm.queer.guide (no trailing slash)
 *   TWENTY_API_KEY  — Bearer key from Settings → API & Webhooks
 */

const API_URL = (Deno.env.get('TWENTY_API_URL') ?? '').replace(/\/+$/, '')
const API_KEY = Deno.env.get('TWENTY_API_KEY') ?? ''

/** True only when both Twenty secrets are present. The sync no-ops otherwise. */
export function twentyConfigured(): boolean {
  return API_URL.length > 0 && API_KEY.length > 0
}

type Json = Record<string, unknown>

async function twentyFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15_000)
  try {
    const res = await fetch(`${API_URL}/rest${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Twenty ${init.method ?? 'GET'} ${path} → ${res.status} ${body.slice(0, 300)}`)
    }
    return res.status === 204 ? null : await res.json()
  } finally {
    clearTimeout(t)
  }
}

/**
 * Twenty REST envelopes vary by operation (`{data:{<plural>:[...]}}` for lists,
 * `{data:{<verb>:{...}}}` for mutations). Pull the first record-like object out
 * defensively rather than hard-coding a key we can't verify per-workspace.
 */
function unwrapRecord(json: unknown): Json | null {
  const root = (json as Json)?.data ?? json
  if (!root || typeof root !== 'object') return null
  const r = root as Json
  if (typeof r.id === 'string') return r
  for (const v of Object.values(r)) {
    if (Array.isArray(v)) return (v[0] as Json) ?? null
    if (v && typeof v === 'object' && typeof (v as Json).id === 'string') return v as Json
  }
  return null
}

async function findByExternalId(objectPath: string, externalId: string): Promise<Json | null> {
  const filter = encodeURIComponent(`externalId[eq]:${externalId}`)
  const json = await twentyFetch(`/${objectPath}?filter=${filter}&limit=1`)
  const list = ((json as Json)?.data as Json)?.[objectPath]
  if (Array.isArray(list)) return (list[0] as Json) ?? null
  return unwrapRecord(json)
}

export interface UpsertResult {
  id: string | null
  action: 'created' | 'updated'
}

/**
 * Create or update a Twenty record identified by its `externalId`. `fields` is
 * the object-specific body (built-in + custom fields); `externalId` is injected.
 */
export async function upsertByExternalId(
  objectPath: string,
  externalId: string,
  fields: Json,
): Promise<UpsertResult> {
  const payload = { ...fields, externalId }
  const existing = await findByExternalId(objectPath, externalId)
  if (existing?.id) {
    await twentyFetch(`/${objectPath}/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return { id: existing.id as string, action: 'updated' }
  }
  const created = await twentyFetch(`/${objectPath}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return { id: unwrapRecord(created)?.id as string ?? null, action: 'created' }
}

/** Split a single display name into Twenty's FULL_NAME composite. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}
