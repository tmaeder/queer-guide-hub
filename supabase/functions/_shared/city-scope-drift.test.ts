import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { CITY_REFRESH_SCOPES, isCityRefreshScope } from './city-class-guard.ts'

/**
 * Every `scope` a registered cron posts to `city-factual-backfill` must be one
 * the function accepts.
 *
 * This is the check that was missing. `city_qid_gap_link` and
 * `city_alias_harvest` posted `qid_gap` and `alias_gap`; the function's
 * allowlist held neither, so both were rewritten to `content_first` and both
 * crons re-worked a list `city_factual_backfill` already works — returning 200
 * and booking `last_run_status='success'` the whole time. Nothing in CI, in the
 * registry, or in the run record could see it. The cost was measured: the 1,538
 * unlinked `personality-birth-place` cities the `qid_gap` scope ranks first had
 * ZERO `wikidata_link` attempts on record.
 *
 * Reads the migrations because that is where the cron bodies are registered and
 * where a new one will be added.
 */
const MIGRATIONS = new URL('../../migrations/', import.meta.url)
const SCOPE_RE = /"scope"\s*:\s*"([a-z_]+)"/g

function scopesInMigrations(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const entry of Deno.readDirSync(MIGRATIONS)) {
    if (!entry.isFile || !entry.name.endsWith('.sql')) continue
    const sql = Deno.readTextFileSync(new URL(entry.name, MIGRATIONS))
    for (const m of sql.matchAll(SCOPE_RE)) {
      const list = found.get(m[1]) ?? []
      list.push(entry.name)
      found.set(m[1], list)
    }
  }
  return found
}

Deno.test('no registered cron posts a scope the function would silently rewrite', () => {
  const found = scopesInMigrations()

  // Positive control FIRST. An empty map also satisfies "every scope is valid",
  // so a regex that stops matching would turn this whole file green while the
  // drift it exists to catch went unchecked.
  assert(
    found.size >= 3,
    `expected at least 3 distinct scopes in migrations, found ${found.size}: ` +
      `${[...found.keys()].join(', ')} — has the cron body format changed?`,
  )
  // The two that were being dropped are the reason this test exists; if they
  // ever stop appearing, the coverage is gone and that must be visible.
  assert(found.has('qid_gap'), 'qid_gap is no longer registered by any cron')
  assert(found.has('alias_gap'), 'alias_gap is no longer registered by any cron')

  const rejected = [...found.entries()].filter(([s]) => !isCityRefreshScope(s))
  assertEquals(
    rejected.map(([s, files]) => `${s} (${files.join(', ')})`),
    [],
    'a cron posts a scope city-factual-backfill does not accept — it will be ' +
      'silently rewritten to content_first and the cron will report success',
  )
})

Deno.test('the accepted set is exactly the selector’s five scopes', () => {
  // Mirrors public.cities_due_for_refresh(p_limit, p_scope). Adding a scope to
  // the selector without adding it here reproduces the original defect.
  assertEquals([...CITY_REFRESH_SCOPES].sort(), [
    'alias_gap', 'all', 'content_first', 'content_only', 'qid_gap',
  ])
})
