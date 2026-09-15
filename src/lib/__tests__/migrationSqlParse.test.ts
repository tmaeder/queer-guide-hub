import { describe, expect, it, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHECKED_BODY_LANGS,
  KNOWN_UNPARSEABLE,
  MIN_CORPUS,
  bodyBalanceFindings,
  loadParser,
  parenBalance,
} from '../../../scripts/check-migration-sql.mjs';

/**
 * Guards `scripts/check-migration-sql.mjs`, which parses every migration with
 * Postgres's own grammar (libpg-query, pinned to 17.x) before it can reach prod.
 *
 * The gate exists because on 2026-09-14 a `COMMENT ON ... IS 'a' || 'b'` — a
 * 42601, since COMMENT ON takes a LITERAL — aborted `db push` on main and
 * stranded every migration queued behind it for four and a half hours. A parse
 * error is unreachable at runtime, so no test that executes logic could find it,
 * and CI's other migration checks only ever look at 14-digit versions.
 *
 * These tests run the REAL parser over the REAL corpus rather than asserting on
 * the script's source text. A source-string assertion would pass against a gate
 * that had stopped matching anything, which is the vacuous-assertion class this
 * repo keeps re-learning.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

let parse: (sql: string) => Promise<unknown>;
beforeAll(async () => {
  parse = await loadParser();
});

async function parses(sql: string): Promise<boolean> {
  try {
    await parse(sql);
    return true;
  } catch {
    return false;
  }
}

describe('migrations parse with the Postgres grammar', () => {
  it('rejects the exact defect that took main down — positive control', async () => {
    // Byte-shape of 50500101100300's original comment. Without this control a
    // parser that silently stopped matching would report a clean corpus forever.
    const broken = [
      'comment on function public.tag_disowned_prose_signals() is',
      "  'Active tags still publishing the prose a disowned entity produced. '",
      "  || 'Complements tag_wikidata_repair_regressions().';",
    ].join('\n');

    expect(await parses(broken)).toBe(false);
  });

  it('accepts the single-literal form that replaced it', async () => {
    expect(
      await parses("comment on function public.f() is 'one literal, no concatenation.';"),
    ).toBe(true);
  });

  it('does not fire on `||` inside dynamic SQL — negative control', async () => {
    // Concatenation is the normal way to interpolate an identifier into EXECUTE.
    // A gate that flagged this would be unusable, and an unusable gate gets muted.
    expect(await parses("do $$ begin execute 'select * from ' || quote_ident('t'); end $$;")).toBe(
      true,
    );
  });

  it('reads a corpus large enough for the sweep to mean something', () => {
    // An empty or mis-pathed directory reports zero defects and reads exactly
    // like a clean corpus.
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThanOrEqual(MIN_CORPUS);
  });

  it('parses every migration in the corpus', async () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    const broken: string[] = [];

    for (const f of files) {
      if (KNOWN_UNPARSEABLE.has(f)) continue;
      if (!(await parses(readFileSync(join(MIGRATIONS, f), 'utf8')))) broken.push(f);
    }

    expect(
      broken,
      'These migrations do not parse. `supabase db push` aborts at the first one and strands every migration queued behind it — the blast radius is the whole repo, not this PR.',
    ).toEqual([]);
  });

  it('needs no exemptions at all', () => {
    // The six original entries were repaired on 2026-09-14, so the corpus is
    // clean with an empty allowlist. This is asserted separately from the sweep
    // above because that sweep SKIPS allowlisted files: re-adding an entry would
    // keep it green while quietly shrinking what is actually checked.
    expect([...KNOWN_UNPARSEABLE]).toEqual([]);
  });

  it('keeps the allowlist honest — any entry must still genuinely fail', async () => {
    // Vacuous while the set is empty, and kept for exactly that reason: it is
    // what stops a future entry from outliving the defect it was added for.
    // The list may only SHRINK. An entry whose file now parses is a stale
    // exemption, and a stale exemption is a place a real new defect can hide.
    const stale: string[] = [];

    for (const f of KNOWN_UNPARSEABLE) {
      if (await parses(readFileSync(join(MIGRATIONS, f), 'utf8'))) stale.push(f);
    }

    expect(
      stale,
      'These files now parse. Delete them from KNOWN_UNPARSEABLE in scripts/check-migration-sql.mjs.',
    ).toEqual([]);
  });

  it('documents the plpgsql blind spot rather than implying coverage', async () => {
    // The outer grammar treats `$$ ... $$` as an opaque string literal, so a
    // syntax error INSIDE a plpgsql body is NOT caught here — only the plpgsql
    // validator at CREATE FUNCTION time sees it, and that needs a live server.
    //
    // If this test ever FAILS that is good news: the parser got stronger, and
    // the "MISSES" section of the script's header must be corrected to match.
    const bodyIsNonsense =
      'create function public.g() returns void language plpgsql as $$ begin if 1 then end $$;';

    expect(await parses(bodyIsNonsense)).toBe(true);
  });
});

/**
 * Layer 2: paren balance INSIDE function and DO bodies.
 *
 * Layer 1 shipped on 2026-09-14 and hours later `db push` broke on main again,
 * on `60000201100000_concord_pair_not_duplicates.sql` — `42601 syntax error at
 * or near ")"`. The whole repair was one `do $concord$ … $concord$;` block whose
 * keep-row UPDATE opened three `jsonb_build_object(` and closed four `)`. Layer
 * 1 passed it CORRECTLY: the outer grammar sees a body as one opaque literal.
 *
 * The failure mode that matters here is a FALSE POSITIVE, because this gate
 * blocks every PR in the repo and a gate that cries wolf is one people learn to
 * bypass. Most of these tests are therefore negative controls — each one is a
 * shape that legitimately contains an unbalanced paren.
 */
describe('paren balance inside function and DO bodies', () => {
  const findings = async (sql: string) => bodyBalanceFindings(sql, await parse(sql));

  it('catches the exact defect that took main down the second time', async () => {
    // The Concord keep-row UPDATE: three opens, four closes.
    const broken = [
      'do $concord$ begin',
      "  update public.cities c set field_provenance = coalesce(c.field_provenance,'{}'::jsonb) || jsonb_build_object(",
      "    'description', jsonb_build_object('corrected', jsonb_build_object(",
      "      'why','row published Concord, North Carolina; identity resolved to Q28249'))))",
      "  where c.id = '15236843-07f0-4e98-af6d-87c6820dc01e';",
      'end $concord$;',
    ].join('\n');

    const out = await findings(broken);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('extra-close-paren');
    expect(out[0].lang).toBe('plpgsql');
  });

  it('accepts the balanced twin — the one-character fix that landed', async () => {
    // Without this the positive control above could be satisfied by a checker
    // that simply rejects every jsonb_build_object nest.
    const fixed = [
      'do $concord$ begin',
      "  update public.cities c set field_provenance = coalesce(c.field_provenance,'{}'::jsonb) || jsonb_build_object(",
      "    'description', jsonb_build_object('corrected', jsonb_build_object(",
      "      'why','row published Concord, North Carolina; identity resolved to Q28249')))",
      "  where c.id = '15236843-07f0-4e98-af6d-87c6820dc01e';",
      'end $concord$;',
    ].join('\n');

    expect(await findings(fixed)).toEqual([]);
  });

  it('catches an unclosed paren, not just an extra one', async () => {
    const out = await findings(
      "do $c$ begin perform jsonb_build_object('a', jsonb_build_object('b','c'); end $c$;",
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('unclosed-paren');
  });

  it('never flags a dollar-quoted STRING holding an unbalanced fragment', async () => {
    // THE false positive that shaped the design. 51000101100000 does string
    // surgery on a function source and contains `$p$) u order by … $q$$p$` — a
    // dollar-quoted string whose CONTENT is deliberately unbalanced SQL, which
    // is entirely valid. A first draft matched `$tag$` out of the text and
    // flagged it; bodies are read off the AST for exactly this reason.
    expect(
      await findings(
        'do $c$ begin v_pat := $p$) u order by is_auto desc limit 800 $q$$p$; end $c$;',
      ),
    ).toEqual([]);
  });

  it('never flags parens inside string literals, comments or identifiers', async () => {
    const safe = [
      "do $c$ begin raise notice 'a )))) b'; end $c$;",
      'do $c$ begin -- ))))\n  perform 1; end $c$;',
      'do $c$ begin /* )) /* nested )) */ )) */ perform 1; end $c$;',
      // `''` doubling is a negative control only. It provably cannot affect
      // balance — same quote positions, sequential pairing, same in-string
      // regions — so no mutation of that branch can fail a test. Measured:
      // removing it leaves the whole corpus at zero findings.
      "do $c$ begin raise notice 'don''t ) stop'; end $c$;",
      "do $c$ begin raise notice E'a\\' ) b'; end $c$;",
      'do $c$ begin perform 1 as "weird)name"; end $c$;',
    ];

    for (const sql of safe) expect(await findings(sql), sql).toEqual([]);
  });

  it('checks LANGUAGE sql bodies too, not only plpgsql', async () => {
    // The real defect this found in the corpus was in a LANGUAGE sql body.
    const out = await findings(
      'create function f() returns int language sql as $b$ select (1))$b$;',
    );
    expect(out).toHaveLength(1);
    expect(out[0].lang).toBe('sql');
  });

  it('skips languages where paren balance is not a known invariant', () => {
    // Anything that is not SQL-shaped is skipped rather than guessed at.
    expect([...CHECKED_BODY_LANGS].sort()).toEqual(['plpgsql', 'sql']);
  });

  it('balances every body in the whole corpus', async () => {
    // The sweep that gives the negative controls their weight: measured at
    // 1,744 files with zero findings once the one real defect was repaired.
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    const bad: string[] = [];

    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      let ast: unknown;
      try {
        ast = await parse(sql);
      } catch {
        continue; // layer 1 already reports this file
      }
      for (const finding of bodyBalanceFindings(sql, ast))
        bad.push(`${f}:${finding.line} ${finding.kind}`);
    }

    expect(
      bad,
      'A body with unbalanced parentheses parses clean at the top level and then fails at `db push`, which aborts and strands every migration queued behind it.',
    ).toEqual([]);
  });

  it('keeps the repaired existence selectors balanced', async () => {
    // Regression guard for the defect this layer found on its first sweep:
    // 20260623170317 carried a fragment spliced in twice in all THREE of its
    // function bodies — the same corruption as the layer-1 repairs, but inside
    // a body, where it never broke top-level parsing. Repaired by pure deletion,
    // and each resulting body was confirmed against pg_proc.prosrc on prod.
    const sql = readFileSync(
      join(MIGRATIONS, '20260623170317_existence_selectors_review.sql'),
      'utf8',
    );

    expect(await findings(sql)).toEqual([]);
    // The duplicate is gone: the CTE body appears once per function, not twice.
    expect(
      sql.match(/FROM public\.entity_existence_signals WHERE entity_type='venue'/g),
    ).toHaveLength(1);
  });

  it('is a paren check, not a body parser — states its own limit', () => {
    // parenBalance is deliberately narrow. A body can be complete nonsense and
    // still balance, which is why the header must not claim body coverage.
    expect(parenBalance('begin if 1 then end')).toBeNull();
  });
});
