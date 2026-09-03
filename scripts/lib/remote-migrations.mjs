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
 * Strip a redundant `<14 digits>_` prefix from a migration NAME.
 *
 * MCP `apply_migration` stamps the version from its own call time, so the
 * established recovery is to commit the file at the stamped version while the
 * NAME still carries the version the author intended — e.g. version
 * 20260620074438 recorded as `20260620100000_messages_phase0_foundations`
 * against the file `20260620074438_messages_phase0_foundations.sql`. That is the
 * same migration, correctly recovered, and comparing raw names would report 17
 * such rows as defects.
 */
export function normalizeMigrationName(name) {
  return String(name ?? '').replace(/^\d{14}_/, '')
}

/**
 * Files whose version is applied to prod under a DIFFERENT migration's name.
 *
 * Pure so it can be tested without a Management API token — the script that
 * uses it cannot run this branch at all without one, which would leave CI as
 * the first place the logic ever executed.
 *
 * @param files      migration basenames, e.g. `20261012100000_foo.sql`
 * @param remoteMap  version -> name, from fetchRemoteMigrations()
 * @param isNew      (file) => boolean, true when the file is new on this branch
 * @returns [{ file, version, remoteName, isNew }]
 */
export function findAppliedNameMismatches(files, remoteMap, isNew = () => true) {
  if (!remoteMap) return []

  // Group by version so an ordinary in-repo duplicate is left to the caller's
  // duplicate check, which has better advice for it.
  const namesByVersion = new Map()
  for (const f of files) {
    const m = f.match(/^(\d{14})_(.+)\.sql$/)
    if (!m) continue
    if (!namesByVersion.has(m[1])) namesByVersion.set(m[1], [])
    namesByVersion.get(m[1]).push(normalizeMigrationName(m[2]))
  }

  const out = []
  for (const f of files) {
    const m = f.match(/^(\d{14})_(.+)\.sql$/)
    if (!m) continue
    const [, version, rawName] = m
    const remoteName = remoteMap.get(version)
    if (remoteName === undefined) continue

    const wanted = normalizeMigrationName(remoteName)
    if (normalizeMigrationName(rawName) === wanted) continue
    // Some other file in the repo IS the applied one -> plain duplicate.
    if ((namesByVersion.get(version) || []).includes(wanted)) continue

    out.push({ file: f, version, remoteName, isNew: isNew(f) })
  }
  return out
}

/**
 * version -> name for remote history, or null when no token is available.
 *
 * The NAME is what makes a silent version collision detectable. `db push`
 * matches by version alone, so when two files claim one version the first to
 * apply wins and the rest are skipped permanently, with a GREEN deploy and a
 * history row that looks perfectly normal — until you read whose name is on it.
 * Twice on 2026-08-29: 20261012100000 recorded as `sweep_skips_attribute_kind`
 * (so `news_vocab_dump_residue` never ran) and 20261019100000 as
 * `entity_lifecycle_dispatchers` (so `kinktionary_overlap_deindex_complete`
 * never ran). Neither had a duplicate IN THE REPO at check time — the colliding
 * file was still on someone else's branch — so no repo-only check could see it.
 */
export async function fetchRemoteMigrations(token = resolveToken()) {
  if (!token) return null
  const rows = await queryHistory(token, 'select version, name from supabase_migrations.schema_migrations order by version')
  const map = new Map()
  for (const r of rows) {
    const v = String(r.version ?? r.VERSION ?? '').trim()
    if (!/^\d{14}$/.test(v) || BASELINE.has(v)) continue
    map.set(v, String(r.name ?? r.NAME ?? '').trim())
  }
  return map
}

/**
 * 14-digit versions present in remote history, or null when no token is
 * available. Throws on a transport/API error — an unreachable API is NOT the
 * same as an empty history, and collapsing the two would make every caller
 * report a clean result during an outage.
 */
export async function fetchRemoteVersions(token = resolveToken()) {
  if (!token) return null
  const rows = await queryHistory(token, 'select version from supabase_migrations.schema_migrations order by version')
  return new Set(
    rows
      .map((r) => String(r.version ?? r.VERSION ?? '').trim())
      .filter((v) => /^\d{14}$/.test(v))
      .filter((v) => !BASELINE.has(v)),
  )
}

/**
 * The recorded SQL for specific versions, for recovering a drifted migration.
 *
 * `statements` is a text[] of PARSED statements, and two properties of that
 * storage decide how a file must be rebuilt from it. Both are measured, not
 * assumed — getting either wrong yields a file that looks recovered and is not:
 *
 *   1. TRAILING SEMICOLONS ARE STRIPPED. Measured on 20261007163200: statement 1
 *      ends `set local statement_timeout = '120s'` and the last ends
 *      `end $verify$`, both without `;`. Joining on newlines alone produces
 *      invalid SQL that would fail on a fresh rebuild — the one occasion an
 *      already-applied migration is ever executed again. STATEMENT_SEPARATOR
 *      puts the semicolons back.
 *
 *   2. A MIGRATION IS OFTEN MULTI-STATEMENT. The same file is 4 statements. A
 *      recovery that reads `statements[1]` silently truncates to the first one.
 *      That is survivable only by luck: all five orphans recovered by hand on
 *      2026-08-29 happened to be single-statement, so `statements[1]` was the
 *      whole file. This function always joins the array.
 *
 * `digest` is computed SERVER-SIDE over the same join this file performs, so the
 * caller can prove the text survived JSON transport unaltered rather than
 * trusting that it did.
 *
 * @param versions iterable of 14-digit version strings
 * @returns Map<version, {name, statements, joined, digest}>, or null with no token
 */
export const STATEMENT_SEPARATOR = ';\n\n'

export async function fetchMigrationBodies(versions, token = resolveToken()) {
  if (!token) return null
  const list = [...versions].filter((v) => /^\d{14}$/.test(v))
  if (list.length === 0) return new Map()

  // Literal-quoted rather than parameterised: the Management API takes a SQL
  // string, and every element is already proven to match /^\d{14}$/ above, so
  // there is nothing here that could carry a quote.
  const inList = list.map((v) => `'${v}'`).join(',')
  const sep = `';' || chr(10) || chr(10)`
  const rows = await queryHistory(
    token,
    `select version, name, statements,
            md5(array_to_string(statements, ${sep})) as digest
       from supabase_migrations.schema_migrations
      where version in (${inList})`,
  )

  const out = new Map()
  for (const r of rows) {
    const v = String(r.version ?? r.VERSION ?? '').trim()
    if (!/^\d{14}$/.test(v)) continue
    // A text[] arrives as a JS array over JSON, but tolerate a raw string so a
    // driver/API change degrades to "one statement" instead of throwing.
    const raw = r.statements ?? r.STATEMENTS
    const statements = Array.isArray(raw) ? raw.map(String) : raw == null ? [] : [String(raw)]
    out.set(v, {
      name: String(r.name ?? r.NAME ?? '').trim(),
      statements,
      joined: statements.join(STATEMENT_SEPARATOR),
      digest: String(r.digest ?? r.DIGEST ?? '').trim(),
    })
  }
  return out
}

/**
 * Rebuild a migration file from its recorded statements.
 *
 * Pure, and exported for that reason: the script that calls it cannot run
 * without a Management API token, so without this seam CI would be the first
 * place the reconstruction logic ever executed — on real drift, at the moment
 * someone is already blocked.
 *
 * Returns null when there is nothing to rebuild. An empty `statements` array is
 * NOT evidence the migration was a no-op; it is what a row written by an
 * out-of-band path looks like, and emitting an empty file would assert
 * "this did nothing" on no evidence.
 */
export function buildRecoveredSql(version, statements, { header = true } = {}) {
  const list = (statements ?? []).map((s) => String(s)).filter((s) => s.trim() !== '')
  if (list.length === 0) return null

  const joined = list.join(STATEMENT_SEPARATOR)
  if (!header) return `${joined};\n`

  return `${[
    '-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.',
    '--',
    `-- Applied to prod as version ${version} with no repo file — the signature of`,
    '-- MCP `apply_migration`, which stamps a version and commits nothing. An applied',
    '-- version with no file fails migration-versions on every PR in the repo and',
    '-- makes `db push` refuse to run.',
    '--',
    '-- Reconstructed from `schema_migrations.statements`, which holds the PARSED',
    '-- statements: trailing semicolons are stripped (re-added here) and any original',
    '-- comment header is NOT recorded, so the reasoning that accompanied this',
    '-- migration is lost. Verified by md5 against a server-computed digest.',
    '--',
    '-- Never re-run: `db push` matches on version and skips an applied one. The file',
    '-- exists so history is complete and a rebuild from zero works.',
    '',
  ].join('\n')}${joined};\n`
}

/**
 * Decide, for each orphaned version, what to write — or why not to.
 *
 * Pure and IO-free: takes the fetched bodies and a branch lookup, returns a
 * plan. The caller does the writing. Extracted for the same reason as
 * buildRecoveredSql, and more urgently: this is the half that decides whether a
 * file gets created at all, so "never invents content" is enforced here. Left
 * inside the CLI it would first execute in CI, on real drift, and the failure
 * mode of getting it wrong is a plausible-looking migration that misrepresents
 * what ran — which passes every downstream check forever.
 *
 * @param orphans   version strings, applied but with no repo file
 * @param bodies    Map<version, {name, statements, joined, digest}> or null
 * @param opts.findOnBranch  (version) => {path, sha, content} | null
 * @param opts.md5           (string) => hex digest
 * @returns {{recovered: Array, skipped: Array}}
 */
export function planRecovery(orphans, bodies, { findOnBranch = () => null, md5 } = {}) {
  const recovered = []
  const skipped = []

  for (const version of orphans) {
    // The author's own file, when it exists, beats a reconstruction: statements
    // does not record comment headers, and this codebase keeps the reasoning
    // for a migration there. Checked BEFORE the body so a stranded branch is
    // never silently downgraded to the lossy path.
    const onBranch = findOnBranch(version)
    if (onBranch?.content) {
      recovered.push({
        version,
        file: onBranch.path,
        source: `commit ${String(onBranch.sha).slice(0, 9)}`,
        content: onBranch.content,
        verified: 'content from the authoring commit',
      })
      continue
    }

    const body = bodies?.get(version)
    if (!body) {
      skipped.push({ version, why: 'no row returned for this version' })
      continue
    }

    // A digest mismatch means the text did not survive transport. Writing it
    // anyway would produce a file that looks recovered and is not.
    if (body.digest && md5 && md5(body.joined) !== body.digest) {
      skipped.push({
        version,
        why: `digest mismatch (server ${body.digest}, local ${md5(body.joined)}) — refusing to write`,
      })
      continue
    }

    const content = buildRecoveredSql(version, body.statements)
    if (content === null) {
      // Not "the migration did nothing" — that is unknowable from here.
      skipped.push({ version, why: 'statements is empty — nothing recorded to recover; needs a human' })
      continue
    }

    // The file MUST sit at the applied version — `db push` matches on version,
    // so a different one leaves the orphan orphaned and adds a second problem.
    const slug = normalizeMigrationName(body.name) || 'recovered_migration'
    recovered.push({
      version,
      file: `supabase/migrations/${version}_${slug}.sql`,
      source: `schema_migrations.statements (${body.statements.length} statement(s))`,
      content,
      verified: body.digest && md5 ? `md5 ${md5(body.joined)}` : 'no server digest returned',
    })
  }

  return { recovered, skipped }
}

/** Shared transport so the two fetchers cannot disagree about response shape. */
async function queryHistory(token, query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
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

  return rows
}
