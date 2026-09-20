#!/usr/bin/env node
/**
 * Schema-object drift: a trigger that runs in production but no migration creates.
 *
 * `trg_personalities_outing_guard` — the seal on the CRITICAL `person_outing_guard` —
 * was attached to prod by hand during the 2026-09-19 incident and lived in no migration.
 * Nothing could see that, and the reason is worth stating precisely rather than as
 * "there was no check":
 *
 *   * `check-migration-drift.mjs` compares `schema_migrations` against repo FILES. It is
 *     exact for "a version applied with no file" and structurally blind to "an OBJECT
 *     that exists with no statement creating it".
 *   * vitest mocks the Supabase client wholesale, so no unit test reaches the catalog.
 *   * `supabase gen types` introspects the live database, so generated types agree with
 *     prod whether or not a migration produced the object.
 *
 * A rebuild from migrations comes up silently missing every such object.
 *
 * This fails on a NEW one. The 21 already on prod are a shrink-only baseline: an entry
 * that starts being covered by a migration is a hard FAILURE telling you to delete it, so
 * the list cannot rot into an allowlist nobody re-reads — the discipline
 * `KNOWN_NAME_MISMATCHES` and `KNOWN_UNPARSEABLE` already use in this repo.
 *
 *   node scripts/check-schema-object-drift.mjs            # gate
 *   node scripts/check-schema-object-drift.mjs --update   # re-baseline after codifying one
 *
 * TRIGGERS ONLY, deliberately. `create or replace function` is the normal way to edit a
 * function, so a function's presence says nothing about whether its CURRENT body came from
 * a migration, and there are ~1,400 of them. A trigger is attached once, `drop trigger if
 * exists` + `create trigger` is the only idiom here, and its absence from the corpus is
 * unambiguous. Under-reaching is the correct error.
 *
 * Called by .github/workflows/data-quality-gates.yml.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const BASELINE = join(HERE, 'schema-object-drift-baseline.json');

const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UPDATE = process.argv.includes('--update');

if (!BASE || !KEY) {
  console.warn(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping schema-object drift check',
  );
  process.exit(0);
}

/**
 * Every `create trigger <name>` in the corpus, as a Set of lowercased names.
 *
 * Covers `create trigger`, `create or replace trigger` and `create constraint trigger`,
 * quoted or bare, with the name on the same line or wrapped to the next — all four forms
 * appear in this repo. A trigger created inside a `do $$ … execute 'create trigger …' $$`
 * block still matches, because the statement text is present either way.
 */
function createdInMigrations() {
  const re = /\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+"?([a-z0-9_]+)"?/gi;
  const found = new Set();
  for (const f of readdirSync(MIGRATIONS)) {
    if (!f.endsWith('.sql')) continue;
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    for (const m of sql.matchAll(re)) found.add(m[1].toLowerCase());
  }
  return found;
}

async function inventory() {
  const res = await fetch(`${BASE}/rest/v1/rpc/schema_trigger_inventory`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    // A probe that cannot look is not a check. Never fall through to "nothing found".
    console.error(
      `✗ schema_trigger_inventory() → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
    console.error('  → If the RPC is missing, the migration that adds it has not applied yet.');
    process.exit(1);
  }
  return res.json();
}

const rows = await inventory();
const created = createdInMigrations();

// Positive controls. "Zero uncovered triggers" is equally true of an empty inventory, a
// broken regex, and a clean corpus — these three are what make the result mean something.
if (rows.length < 100) {
  console.error(`✗ inventory returned ${rows.length} triggers — expected the full public set`);
  process.exit(1);
}
if (created.size < 100) {
  console.error(
    `✗ only ${created.size} create-trigger statements found in ${MIGRATIONS} — the scanner is broken, not the corpus`,
  );
  process.exit(1);
}
if (!created.has('trg_personalities_outing_guard')) {
  console.error(
    '✗ the scanner cannot see trg_personalities_outing_guard, which 99991789842467 creates — the regex has drifted',
  );
  process.exit(1);
}

const uncovered = rows
  .filter((r) => !created.has(String(r.trigger_name).toLowerCase()))
  .map((r) => `${r.table_name}.${r.trigger_name}`)
  .sort();

if (UPDATE) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        note: 'Prod triggers with no create-trigger statement in supabase/migrations. SHRINK-ONLY: codify one and remove its entry. Never add.',
        uncovered,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`✓ baseline written: ${uncovered.length} uncovered trigger(s)`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).uncovered ?? [];
const known = new Set(baseline);
const live = new Set(uncovered);

const added = uncovered.filter((t) => !known.has(t));
// Shrink-only: an entry that is now covered must be removed, or the list becomes an
// allowlist that outlives its reasons.
const nowCovered = baseline.filter((t) => !live.has(t));

let failed = false;

if (added.length) {
  failed = true;
  console.error(`✗ ${added.length} trigger(s) run in production that NO migration creates:`);
  for (const t of added) console.error(`    ${t}`);
  console.error(
    '  → A hand-attached trigger disappears on any rebuild from migrations, and the invariant it enforces goes with it.',
  );
  console.error(
    '  → Add a `drop trigger if exists` + `create trigger` to a migration (see 99991789842467), then re-run.',
  );
}

if (nowCovered.length) {
  failed = true;
  console.error(`✗ ${nowCovered.length} baseline entr(ies) are now covered by a migration:`);
  for (const t of nowCovered) console.error(`    ${t}`);
  console.error('  → Delete them from scripts/schema-object-drift-baseline.json (shrink-only).');
}

if (failed) process.exit(1);

console.log(
  `✓ schema-object drift OK (${rows.length} triggers, ${created.size} created by migrations, ${uncovered.length} known-uncovered)`,
);
