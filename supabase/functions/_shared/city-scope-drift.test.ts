import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts'
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
const SCOPE_RE = /"scope"\s*:\s*"([^"]*)"/g

/** Split one HTTP call's arguments without treating quoted/nested commas as separators. */
function httpArguments(sql: string, open: number): string[] {
  const args: string[] = []
  let start = open + 1
  let depth = 1
  for (let i = start; i < sql.length; i++) {
    const char = sql[i]
    if (char === "'" || char === '"') {
      const quote = char
      for (i++; i < sql.length; i++) {
        if (sql[i] !== quote) continue
        if (sql[i + 1] === quote) {
          i++
          continue
        }
        break
      }
    } else if (char === '$') {
      const tag = sql.slice(i).match(/^\$(?:[a-zA-Z_][\w]*)?\$/)?.[0]
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length)
        if (end < 0) throw new Error('Unterminated HTTP-call dollar quote')
        i = end + tag.length - 1
      }
    } else if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i + 2)
      i = end < 0 ? sql.length : end
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2)
      if (end < 0) throw new Error('Unterminated HTTP-call comment')
      i = end + 1
    } else if (char === '(') {
      depth++
    } else if (char === ')') {
      if (--depth === 0) {
        args.push(sql.slice(start, i))
        return args
      }
    } else if (char === ',' && depth === 1) {
      args.push(sql.slice(start, i))
      start = i + 1
    }
  }
  throw new Error('Unterminated net.http_post call')
}

function cityScopesInSql(sql: string): string[] {
  if (!sql.includes('city-factual-backfill')) return []
  const scopes: string[] = []
  for (const call of sql.matchAll(/\bnet\.http_post\s*\(/gi)) {
    const args = httpArguments(sql, call.index! + call[0].length - 1).map((
      arg,
    ) => arg.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, ''))
    const url = args.find((arg) => /^\s*url\s*(?::=|=>)/i.test(arg)) ??
      args[0] ?? ''
    if (
      !/(?:\/functions\/v1\/|['"])city-factual-backfill(?=['"?\s]|$)/.test(url)
    ) continue
    const body = args.find((arg) => /^\s*body\s*(?::=|=>)/i.test(arg)) ??
      args[1] ?? ''
    for (const match of body.matchAll(SCOPE_RE)) scopes.push(match[1])
    for (const match of body.matchAll(/'scope'\s*,\s*'([^']*)'/g)) {
      scopes.push(match[1])
    }
  }
  return scopes
}

function scopesInMigrations(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const entry of Deno.readDirSync(MIGRATIONS)) {
    if (!entry.isFile || !entry.name.endsWith('.sql')) continue
    const sql = Deno.readTextFileSync(new URL(entry.name, MIGRATIONS))
    for (const scope of cityScopesInSql(sql)) {
      const list = found.get(scope) ?? []
      list.push(entry.name)
      found.set(scope, list)
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
  assert(
    found.has('alias_gap'),
    'alias_gap is no longer registered by any cron',
  )

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
    'alias_gap',
    'all',
    'content_first',
    'content_only',
    'qid_gap',
  ])
})

Deno.test('scope discovery associates payloads with their own HTTP endpoint', () => {
  const sql = `
    select net.http_post(
      url := 'https://project.supabase.co/functions/v1/city-factual-backfill',
      headers := '{"scope":"header_not_a_city_scope"}'::jsonb,
      body := '{"scope":"qid_gap","note":"a comma, and a closing )"}'::jsonb
    );
    select net.http_post(
      url := 'https://project.supabase.co/functions/v1/source-prideplaces',
      body := '{"scope":"all_businesses_and_events"}'::jsonb
    );
    insert into source_registry values('{"scope":"all_businesses_and_events"}');
  `
  assertEquals(cityScopesInSql(sql), ['qid_gap'])
})

Deno.test('scope discovery retains unsupported city payloads and nested constructors', () => {
  const sql = `select net.http_post(
    url => 'https://project.supabase.co/functions/v1/city-factual-backfill',
    body => jsonb_build_object('options', jsonb_build_object('note', 'a,b'), 'scope', 'unsupported_city_scope')
  );`
  const scopes = cityScopesInSql(sql)
  assertEquals(scopes, ['unsupported_city_scope'])
  assertEquals(scopes.filter((scope) => !isCityRefreshScope(scope)), [
    'unsupported_city_scope',
  ])
})

Deno.test('scope discovery accepts dollar-quoted payloads in scheduled SQL', () => {
  const sql = `select cron.schedule('city', '* * * * *', $cron$
    select net.http_post(
      url := 'https://project.supabase.co/functions/v1/city-factual-backfill',
      -- A comment with a closing parenthesis: )
      body := $payload\${"scope":"alias_gap"}$payload$::jsonb
    );
  $cron$);`
  assertEquals(cityScopesInSql(sql), ['alias_gap'])
})
