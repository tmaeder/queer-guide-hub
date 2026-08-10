/**
 * Remote migration history (supabase_migrations.schema_migrations) via the
 * Management API.
 *
 * Extracted so check-migration-drift.mjs and check-migration-versions.mjs
 * agree on what "already applied" means. They ask opposite questions about the
 * same set — drift asks "applied but not committed", the version check asks
 * "committed below the max, will db push abort" — and a second, subtly
 * different implementation of the fetch is how those two answers drift apart.
 *
 * Every function here is credential-optional: with no token they return null,
 * and the CALLER decides whether that is fatal. A check that silently treats
 * "could not look" as "nothing found" is worse than no check at all.
 */
import { existsSync, readFileSync } from 'node:fs'

export const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'xqeacpakadqfxjxjcewc'

/** The all-zeros row is the CLI's schema baseline; it never has a repo file. */
export const BASELINE = new Set(['00000000000000'])

/** Token from the environment, else from an uncommitted .env file. */
export function resolveToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue
    const m = readFileSync(file, 'utf8').match(/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+?)\s*$/m)
    if (m) return m[1].replace(/^["']|["']$/g, '')
  }
  return null
}

/**
 * 14-digit versions present in remote history, or null when no token is
 * available. Throws on a transport/API error — an unreachable API is NOT the
 * same as an empty history, and collapsing the two would make every caller
 * report a clean result during an outage.
 */
export async function fetchRemoteVersions(token = resolveToken()) {
  if (!token) return null

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'select version from supabase_migrations.schema_migrations order by version',
      }),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Management API query failed: ${res.status} ${res.statusText}\n${body}`)
  }

  const body = await res.json()
  // The Management API returns a bare array of row objects; tolerate a
  // {result|rows|data: [...]} wrapper too so a CLI/API revision can't silently
  // turn detection into a no-op.
  const rows = Array.isArray(body)
    ? body
    : Array.isArray(body?.result)
      ? body.result
      : Array.isArray(body?.rows)
        ? body.rows
        : Array.isArray(body?.data)
          ? body.data
          : null

  if (rows === null) {
    throw new Error(`Unrecognized Management API response shape: ${JSON.stringify(body).slice(0, 200)}`)
  }

  return new Set(
    rows
      .map((r) => String(r.version ?? r.VERSION ?? '').trim())
      .filter((v) => /^\d{14}$/.test(v))
      .filter((v) => !BASELINE.has(v)),
  )
}
