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
 *   CATCHES   unbalanced parentheses INSIDE a function or DO body (layer 2,
 *             added 2026-09-15). See below — this is a narrow, measured slice
 *             of the body, not a body parser.
 *   MISSES    every other syntax error INSIDE a plpgsql body. The outer grammar
 *             treats `$$ ... $$` as an opaque string literal; the body is only
 *             compiled by the plpgsql validator at CREATE FUNCTION time, which
 *             needs a live server. Measured: a function whose body is
 *             `begin if 1 then end` still parses clean here.
 *   MISSES    everything semantic — a missing table, a wrong column, a failing
 *             postcondition. `50500101100400`'s `hard-point` failure was of
 *             that kind and this gate would NOT have caught it. Closing that
 *             needs a scratch database with the full schema replayed, which is
 *             a separate and much larger change.
 *
 * So layer 1 is one layer, not the answer. It is the layer that was free.
 *
 * ── LAYER 2: PAREN BALANCE INSIDE BODIES (2026-09-15) ──────────────────────
 * WHY IT EXISTS. On 2026-09-14, hours after layer 1 shipped, `db push` broke on
 * `main` again — `60000201100000_concord_pair_not_duplicates.sql`, `42601 syntax
 * error at or near ")"`. The whole repair was one `do $concord$ … $concord$;`
 * block whose keep-row UPDATE opened three `jsonb_build_object(` and closed four
 * `)`. Layer 1 passed it, CORRECTLY: the outer grammar sees one opaque literal.
 * Reproduced before writing a line of this — that exact block parses clean under
 * layer 1, while its balanced twin also parses, so layer 1 cannot tell them
 * apart. The blast radius was again the whole repo, and #3716's two migrations
 * queued behind it were stranded too.
 *
 * Paren balance is a real invariant of any SQL or plpgsql body: outside string
 * literals, comments and nested dollar-quoted strings, every `(` must close.
 * That is all this checks. It is not a body parser and must not be described as
 * one — it is the cheap half of the body that can be checked without a server.
 *
 * TWO DESIGN FACTS, BOTH MEASURED RATHER THAN REASONED.
 *
 * (1) BODIES COME FROM THE AST, NEVER FROM PATTERN-MATCHING `$tag$`. The first
 * draft balanced every dollar-quoted region it found and false-positived on
 * `51000101100000_geo_dedup_real_sources.sql`, which does string surgery on a
 * function source and legitimately contains `$p$) u order by … $q$$p$` — a
 * dollar-quoted STRING whose content is an unbalanced SQL fragment, which is
 * entirely valid. A dollar-quoted region is only a body when the parser says it
 * is one, so bodies are read off `DoStmt` / `CreateFunctionStmt`. For the same
 * reason a nested dollar-quoted region INSIDE a body is SKIPPED, not recursed:
 * from the body's point of view it is a string literal.
 *
 * (2) IT RUNS ONLY ON `sql` AND `plpgsql` BODIES, and only on files layer 1
 * accepted — without an AST there is no way to tell a body from a literal, so a
 * file that fails to parse is already reported by layer 1 and is not guessed at.
 *
 * FALSE POSITIVES ARE THE FAILURE MODE THAT MATTERS, because this gate blocks
 * every PR in the repo, and a gate that cries wolf is one people learn to
 * bypass. Measured across the whole corpus at the time it shipped: 1,738 files,
 * ONE finding, and that finding was a real defect (below). Controls that must
 * stay clean are in the test: parens inside string literals, line comments,
 * nested block comments, doubled `''` escapes, `E'\''` backslash escapes,
 * quoted identifiers, and dollar-quoted strings holding unbalanced fragments.
 *
 * WHAT IT FOUND ON ITS FIRST SWEEP. `20260623170317_existence_selectors_review
 * .sql` carried the SAME duplicated-block corruption the six layer-1 repairs
 * did — a fragment spliced in twice, the duplicate split across lines and the
 * survivor joined onto one — in all THREE of its function bodies. The layer-1
 * repair missed it precisely because it sits inside a body, where it never broke
 * top-level parsing. The file is applied, so a rebuild from zero would have
 * failed on it. Repaired here by pure DELETION (+0/-26), and the repair is not a
 * judgement call: each resulting body was compared against `pg_proc.prosrc` on
 * prod and all three match by md5 on whitespace-normalised text.
 *
 * ONE TRAP WORTH KEEPING, since it cost a wrong conclusion for a few minutes:
 * `btrim(x)` with ONE argument trims SPACES ONLY, not newlines. Comparing
 * `md5(btrim(regexp_replace(prosrc,'\s+',' ','g')))` against a JS
 * `.replace(/\s+/g,' ').trim()` agrees; `md5(regexp_replace(btrim(prosrc), …))`
 * leaves a leading and trailing space and reports every body as 2 chars adrift.
 * Collapse first, then trim — on both sides.
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

/**
 * Languages whose bodies are SQL-shaped enough for paren balance to be a real
 * invariant. Anything else (plv8, c, internal) is skipped rather than guessed at.
 */
export const CHECKED_BODY_LANGS = new Set(['sql', 'plpgsql']);

const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/**
 * Bodies of DO blocks and CREATE FUNCTION/PROCEDURE, read off the AST.
 *
 * Read off the AST and NEVER matched out of the text: a dollar-quoted region is
 * only a body when the parser says so. `51000101100000` contains
 * `$p$) u order by … $q$$p$`, a dollar-quoted STRING holding a deliberately
 * unbalanced SQL fragment, and a text-matching version of this flagged it.
 */
export function collectFunctionBodies(ast) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    for (const [key, val] of Object.entries(node)) {
      if (key === 'DoStmt' || key === 'CreateFunctionStmt') {
        // A DO block is plpgsql unless it says otherwise; a function must say.
        let lang = key === 'DoStmt' ? 'plpgsql' : null;
        let body = null;
        for (const opt of val.args ?? val.options ?? []) {
          const d = opt?.DefElem;
          if (!d) continue;
          if (d.defname === 'language') lang = d.arg?.String?.sval ?? lang;
          if (d.defname === 'as') {
            body = d.arg?.String?.sval ?? d.arg?.List?.items?.[0]?.String?.sval ?? null;
          }
        }
        if (body != null) out.push({ body, lang: String(lang ?? '').toLowerCase() });
      }
      visit(val);
    }
  };
  visit(ast?.stmts ?? ast);
  return out;
}

/**
 * Walk a body counting parens, skipping everything where a paren is just a
 * character: line comments, NESTED block comments, single-quoted strings (with
 * `''` doubling, and backslash escapes only for E'' strings), double-quoted
 * identifiers, and nested dollar-quoted strings.
 *
 * Returns null when balanced, else the first offence.
 */
export function parenBalance(body) {
  let depth = 0;
  let i = 0;
  const n = body.length;
  while (i < n) {
    const c = body[i];

    if (c === '-' && body[i + 1] === '-') {
      const nl = body.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }

    // Block comments NEST in Postgres, so this counts rather than seeking `*/`.
    if (c === '/' && body[i + 1] === '*') {
      let nest = 1;
      i += 2;
      while (i < n && nest > 0) {
        if (body[i] === '/' && body[i + 1] === '*') {
          nest++;
          i += 2;
          continue;
        }
        if (body[i] === '*' && body[i + 1] === '/') {
          nest--;
          i += 2;
          continue;
        }
        i++;
      }
      continue;
    }

    // A nested dollar-quoted region is a STRING from this body's point of view.
    if (c === '$') {
      const m = DOLLAR_TAG.exec(body.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const close = body.indexOf(tag, i + tag.length);
        if (close === -1) return { kind: 'unterminated-dollar-quote', offset: i };
        i = close + tag.length;
        continue;
      }
    }

    if (c === '"') {
      i++;
      while (i < n) {
        if (body[i] === '"') {
          if (body[i + 1] === '"') {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === "'") {
      // Backslash escapes are only special in E'' strings; with
      // standard_conforming_strings a backslash in an ordinary string is data.
      //
      // The `''` doubling below CANNOT change the outcome of this function, and
      // that is measured, not assumed: quote positions are identical either way
      // and pairing is sequential, so the union of in-string regions is the same
      // whether `''` is treated as an escape or as close-then-reopen. Removing
      // the branch leaves all 1,744 corpus files at zero findings, and no
      // mutation of it can fail a test. It is kept because this is a string
      // skipper and should be a correct one, not because balance depends on it.
      // Do not write a test claiming to guard it — there is nothing to observe.
      const isE = i > 0 && /[Ee]/.test(body[i - 1]) && !/[A-Za-z0-9_$]/.test(body[i - 2] ?? ' ');
      i++;
      while (i < n) {
        if (isE && body[i] === '\\') {
          i += 2;
          continue;
        }
        if (body[i] === "'") {
          if (body[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth < 0) return { kind: 'extra-close-paren', offset: i };
    }
    i++;
  }
  return depth > 0 ? { kind: 'unclosed-paren', offset: n, depth } : null;
}

/** Findings for one file, with a 1-based line number in the FILE. */
export function bodyBalanceFindings(sql, ast) {
  const findings = [];
  for (const { body, lang } of collectFunctionBodies(ast)) {
    if (!CHECKED_BODY_LANGS.has(lang)) continue;
    const bad = parenBalance(body);
    if (!bad) continue;
    const at = sql.indexOf(body);
    const abs = at === -1 ? 0 : at + Math.min(bad.offset, Math.max(body.length - 1, 0));
    findings.push({
      kind: bad.kind,
      lang,
      line: sql.slice(0, abs).split('\n').length,
      depth: bad.depth,
    });
  }
  return findings;
}

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
  const unbalanced = [];

  for (const file of targets) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    let err = null;
    let ast = null;
    try {
      ast = await parse(sql);
    } catch (e) {
      err = String(e.message).split('\n')[0];
    }

    if (err && !KNOWN_UNPARSEABLE.has(file)) failures.push([file, err]);
    if (!err && KNOWN_UNPARSEABLE.has(file)) fixed.push(file);

    // Layer 2 only runs where the grammar accepted the file: without an AST
    // there is no way to tell a code body from a dollar-quoted string literal,
    // and layer 1 is already reporting that file.
    if (!err) {
      for (const f of bodyBalanceFindings(sql, ast)) unbalanced.push([file, f]);
    }
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

  for (const [file, f] of unbalanced) {
    const what =
      f.kind === 'extra-close-paren'
        ? 'a `)` here closes a parenthesis that was never opened'
        : f.kind === 'unclosed-paren'
          ? `${f.depth} parenthes${f.depth === 1 ? 'is is' : 'es are'} still open at the end of this body`
          : 'a dollar-quoted string inside this body is never closed';
    console.error(
      `::error file=supabase/migrations/${file},line=${f.line}::unbalanced parentheses in a ${f.lang} body — ${what}. ` +
        'The outer grammar cannot see inside a body, so this parses clean here and fails at `db push`, ' +
        'which aborts and strands every migration queued behind it.',
    );
  }

  const scope = baseRef ? `${targets.length} changed` : `${targets.length}`;
  if (failures.length || fixed.length || unbalanced.length) {
    console.error(
      `Parsed ${scope} migration(s): ${failures.length} unparseable, ${unbalanced.length} with unbalanced ` +
        `parentheses inside a body, ${fixed.length} stale allowlist entr(ies).`,
    );
    process.exit(1);
  }

  console.log(
    `Parsed ${scope} migration(s) with the Postgres 17 grammar, and balanced every ` +
      `${CHECKED_BODY_LANGS.size === 2 ? 'sql/plpgsql' : ''} body — all valid` +
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
