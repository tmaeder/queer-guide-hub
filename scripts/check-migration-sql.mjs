#!/usr/bin/env node
/**
 * Parse every migration with Postgres's OWN grammar before it can reach prod.
 *
 * WHY THIS EXISTS. On 2026-09-14 `db push` was broken on `main` from 10:57 to
 * 15:33 across four consecutive deploy failures on four different files. The
 * first was `50500101100300`, which ended:
 *
 *     comment on function public.tag_disowned_prose_signals() is
 *       'Active tags still publishing ...'
 *       || 'Complements tag_wikidata_repair_regressions(), ...'
 *
 * `COMMENT ON ... IS` takes a string LITERAL, so that is `42601 syntax error at
 * or near "||"`. Being a PARSE error it is unreachable at runtime, so no amount
 * of correct surrounding logic saves it — and because `db push` stops at the
 * first failing file and takes everything queued behind it, the blast radius is
 * the whole repository rather than one PR.
 *
 * Nothing in CI could see it. `check-migration-versions.mjs` and
 * `check-migration-drift.mjs` only ever look at 14-digit VERSIONS; no linter
 * here parses SQL; no unit test executes migration SQL. The file was reviewed
 * and read like ordinary English.
 *
 * This closes that hole with the real thing: libpg-query is Postgres's actual
 * parser (pinned to 17.x, the server version this project runs), so the grammar
 * cannot drift from the grammar `db push` will meet.
 *
 * ── WHAT THIS CATCHES, AND WHAT IT DOES NOT ────────────────────────────────
 * Stating the limit precisely matters more than the feature, because a gate
 * believed to cover more than it does is worse than no gate.
 *
 *   CATCHES   top-level SQL syntax errors — the 42601 class, unbalanced
 *             dollar-quoting, malformed DDL. Verified against the real defect.
 *   MISSES    syntax errors INSIDE a plpgsql body. The outer grammar treats
 *             `$$ ... $$` as an opaque string literal; the body is only
 *             compiled by the plpgsql validator at CREATE FUNCTION time, which
 *             needs a live server. Measured: a function whose body is
 *             `begin if 1 then end` parses clean here.
 *   MISSES    everything semantic — a missing table, a wrong column, a failing
 *             postcondition. `50500101100400`'s `hard-point` failure was of
 *             that kind and this gate would NOT have caught it. Closing that
 *             needs a scratch database with the full schema replayed, which is
 *             a separate and much larger change.
 *
 * So this is one layer, not the answer. It is the layer that was free.
 *
 * ── THE ALLOWLIST, NOW EMPTY, AND WHY IT MAY ONLY SHRINK ───────────────────
 * The first corpus sweep found SIX already-applied files that did not parse.
 * All six are REPAIRED (2026-09-14) and the allowlist is empty; it stays as the
 * mechanism, so a future entry is a deliberate, reviewable act and the count can
 * only ever go back to zero. A file listed here that starts parsing is a hard
 * FAILURE telling you to delete its entry, so the list can never rot into a
 * place where new defects hide. Same discipline as KNOWN_NAME_MISMATCHES.
 *
 * WHAT THEY ACTUALLY WERE — and the first reading of it here was wrong. This
 * header used to say they were "corrupted mid-file" and could not be repaired
 * without inventing content. Five of the six were in fact ONE mechanical
 * corruption repeated: a block of text spliced in twice, where the duplicate
 * carries a header split across lines (` RETURNS jsonb` / ` LANGUAGE plpgsql`)
 * and the survivor has the same header joined onto one line. The repair is pure
 * DELETION of the duplicate — +0/-25 lines across the four `2026062317*` files,
 * and 22 of the 25 removed lines were verified to still have an identical twin
 * in the file. Nothing was reconstructed.
 *
 * The other two needed a decision rather than a deletion, and both are recorded
 * in the files themselves: `20260511000000` ended with two `CREATE POLICY IF NOT
 * EXISTS` statements, a clause PostgreSQL has never had, so they never executed
 * and prod carries no such policies; `20261028120000` had been deliberately
 * emptied to a no-op and the emptying was left half-done, stranding ~70 lines of
 * plpgsql after the block that replaced their opener.
 *
 * TWO THINGS THE RECORD SETTLED THAT READING COULD NOT. `schema_migrations
 * .statements` is a partial record for these rows (the CLI's splitter gives up
 * on unbalanced dollar-quoting and stores one truncated statement), so it cannot
 * rebuild a file — but it is still authoritative about WHICH of two candidate
 * forms ran. In `20260623170823` the file carried both a `DO $$`/`END $$;` pair
 * and a `DO $outer$`/`END $outer$;` pair around one block; the applied statement
 * contains the `$outer$` pair and does not contain `DO $$` at all, which is the
 * opposite of what the surrounding comment placement suggested. Ask the record,
 * not the layout.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/**
 * Pre-existing unparseable migrations, all APPLIED. May only ever shrink.
 * Do not add to this list to get a build green — fix the file instead.
 */
export const KNOWN_UNPARSEABLE = new Set([
  // Empty by design. All six original entries were repaired on 2026-09-14.
  // Do not add to this list to get a build green — fix the file instead.
]);

/**
 * A sweep over an empty or mis-pathed directory reports zero defects and reads
 * exactly like a clean corpus. The repo has re-learned that confusion several
 * times, so assert the sweep actually looked at something.
 */
export const MIN_CORPUS = 1000;

export async function loadParser() {
  const pg = await import('libpg-query');
  const mod = pg.default ?? pg;
  if (typeof mod.loadModule === 'function') await mod.loadModule();
  return (sql) => mod.parse(sql);
}

function changedMigrations(baseRef) {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=AM', `${baseRef}...HEAD`],
    { encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter((p) => p.startsWith('supabase/migrations/') && p.endsWith('.sql'))
    .map((p) => p.slice('supabase/migrations/'.length));
}

async function main() {
  const args = process.argv.slice(2);
  const changedIdx = args.indexOf('--changed');
  const baseRef = changedIdx >= 0 ? args[changedIdx + 1] : null;

  const parse = await loadParser();
  const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));

  if (all.length < MIN_CORPUS) {
    console.error(
      `::error::Only ${all.length} migrations found under ${MIGRATIONS} (expected >= ${MIN_CORPUS}). ` +
        'Refusing to report a clean sweep over a corpus this small — it is far more likely the path is wrong.',
    );
    process.exit(1);
  }

  const targets = baseRef ? changedMigrations(baseRef) : all;
  if (baseRef && targets.length === 0) {
    console.log('No migrations added or modified in this change.');
    return;
  }

  const failures = [];
  const fixed = [];

  for (const file of targets) {
    let err = null;
    try {
      await parse(readFileSync(join(MIGRATIONS, file), 'utf8'));
    } catch (e) {
      err = String(e.message).split('\n')[0];
    }

    if (err && !KNOWN_UNPARSEABLE.has(file)) failures.push([file, err]);
    if (!err && KNOWN_UNPARSEABLE.has(file)) fixed.push(file);
  }

  for (const [file, err] of failures) {
    console.error(
      `::error file=supabase/migrations/${file}::${err} — this file does not parse, so \`supabase db push\` ` +
        'will abort here and every migration queued behind it will be stranded.',
    );
  }

  // A file that starts parsing must leave the list, or the list rots into a
  // place where a genuinely new defect could hide behind a stale entry.
  for (const file of fixed) {
    console.error(
      `::error file=scripts/check-migration-sql.mjs::${file} now parses — remove it from KNOWN_UNPARSEABLE. ` +
        'That list may only shrink.',
    );
  }

  const scope = baseRef ? `${targets.length} changed` : `${targets.length}`;
  if (failures.length || fixed.length) {
    console.error(`Parsed ${scope} migration(s): ${failures.length} unparseable, ${fixed.length} stale allowlist entr(ies).`);
    process.exit(1);
  }

  console.log(
    `Parsed ${scope} migration(s) with the Postgres 17 grammar — all valid` +
      (baseRef
        ? '.'
        : KNOWN_UNPARSEABLE.size
          ? ` (${KNOWN_UNPARSEABLE.size} pre-existing exempt).`
          : ' — no exemptions.'),
  );
}

// Only run as a CLI. Importing this from a test must not execute the sweep or
// call process.exit — the test needs the allowlist and the parser, not the run.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((e) => {
    console.error(`::error::migration SQL check failed to run: ${e?.message ?? e}`);
    process.exit(2);
  });
}
