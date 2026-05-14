// Thin Meilisearch admin client. Holds the admin key in this module only.
// Never returned to callers; only used to build outbound fetches.

const MEILI_URL = Deno.env.get('MEILISEARCH_URL') ?? ''
const MEILI_ADMIN_KEY = Deno.env.get('MEILISEARCH_ADMIN_KEY') ?? ''

export class MeiliError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function meiliFetch(
  path: string,
  init?: RequestInit & { searchParams?: Record<string, string> },
): Promise<unknown> {
  if (!MEILI_URL || !MEILI_ADMIN_KEY) {
    throw new MeiliError(500, null, 'MEILISEARCH_URL or MEILISEARCH_ADMIN_KEY not configured')
  }
  const url = new URL(path.replace(/^\//, ''), MEILI_URL.endsWith('/') ? MEILI_URL : MEILI_URL + '/')
  if (init?.searchParams) {
    for (const [k, v] of Object.entries(init.searchParams)) {
      url.searchParams.set(k, v)
    }
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${MEILI_ADMIN_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let parsed: unknown = text
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      // leave as text
    }
  }
  if (!res.ok) {
    throw new MeiliError(res.status, parsed, `Meilisearch ${res.status}`)
  }
  return parsed
}

export const meili = {
  listIndexes: () => meiliFetch('indexes', { searchParams: { limit: '100' } }),
  indexStats: (name: string) => meiliFetch(`indexes/${encodeURIComponent(name)}/stats`),
  indexSettings: (name: string) => meiliFetch(`indexes/${encodeURIComponent(name)}/settings`),
  patchIndexSettings: (name: string, body: Record<string, unknown>) =>
    meiliFetch(`indexes/${encodeURIComponent(name)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  search: (name: string, body: Record<string, unknown>) =>
    meiliFetch(`indexes/${encodeURIComponent(name)}/search`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  task: (uid: number) => meiliFetch(`tasks/${uid}`),
  listDocuments: (name: string, limit = 1000, offset = 0) =>
    meiliFetch(`indexes/${encodeURIComponent(name)}/documents`, {
      searchParams: { limit: String(limit), offset: String(offset), fields: 'id' },
    }),
}

export function isConfigured(): boolean {
  return Boolean(MEILI_URL && MEILI_ADMIN_KEY)
}
