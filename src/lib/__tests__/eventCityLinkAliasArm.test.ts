import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991790621307_event_city_link_alias_arm.sql.
//
// `run_event_city_link` matched `lower(cities.name) = lower(events.city)` and nothing
// else, so every German- or French-language event naming its city by the endonym
// (München, Köln, Wien, Genf, Bruxelles) stayed unlinked forever against a `cities`
// table that stores the English exonym -- and a null `city_id` kills the whole
// downstream cascade (state, centroid coordinates, timezone). The alias data was
// already in `city_aliases`; the linker simply never consulted it.
//
// THE RULE THIS FILE EXISTS FOR: an alias may RENAME a city; it may not DE-QUALIFY
// one. `city_aliases` contains qualified-name rows whose alias is the BARE name, so
// "exactly one alias target in this country" is satisfied while being wrong:
//
//   Springfield -> "Springfield Township", Pennsylvania, on 27 events that are
//                  Springfield MISSOURI, which is not in `cities` at all
//   Schwerin    -> "Schwerin, Brandenburg", whose region_name says HESSE
//
// The cost is accepted deliberately: four CORRECT pairs are also refused
// (Washington/"Washington, D.C." among them). 18 true positives given up to refuse 28
// true negatives, because an unlinked event is recoverable and a wrong city is not.
//
// Assertions are scoped to the half of the statement they are about, and run over
// COMMENT-STRIPPED source. This migration's header quotes the very strings its
// statements contain -- it names Springfield, Schwerin, every allowed exonym pair, and
// (critically) the rejected `LIKE alias || '[ ,-]%'` form verbatim -- so a bare
// toContain over the raw file passes against a deleted guard. That is the
// vacuous-assertion class CLAUDE.md records repeatedly.

const MIGRATION = '99991790621307_event_city_link_alias_arm.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Migration text with comment lines removed, so prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The helper's own definition: the rule lives here. */
const helper = statements.slice(
  statements.indexOf('CREATE OR REPLACE FUNCTION public.city_by_alias'),
  statements.indexOf('COMMENT ON FUNCTION public.city_by_alias'),
);

/** The runner's body, which must call the helper and keep guards A and B. */
const runner = statements.slice(
  statements.indexOf('CREATE OR REPLACE FUNCTION public.run_event_city_link'),
  statements.indexOf('DO $verify$'),
);

/** Just the postconditions. */
const verify = statements.slice(statements.indexOf('DO $verify$'));

describe('city_by_alias -- the de-qualification rule', () => {
  it('refuses a target that is the alias plus a trailing qualifier', () => {
    // The whole content of the change. Without this, Springfield resolves to
    // Springfield Township and 27 Missouri events land in Pennsylvania.
    expect(helper).toMatch(/AND NOT \(/);
    expect(helper).toMatch(/~ \('\^' \|\| regexp_replace\(/);
    // The character class is what makes it a QUALIFIER test rather than a prefix
    // test: space, comma or hyphen must follow the alias.
    expect(helper).toContain("|| '[ ,\\-]')");
  });

  it('uses a regex and never LIKE for that test', () => {
    // LIKE has no character classes, so `LIKE alias || '[ ,-]%'` searches for the
    // literal text "[ ,-]" and can never be true -- it would look like a guard and
    // enforce nothing. An earlier draft of this file shipped exactly that as dead
    // code shadowed by the regex.
    expect(helper).not.toMatch(/LIKE\s+.*\[ ,/);
    expect(helper).toMatch(/~ \('\^'/);
  });

  it('compares unaccented, so a diacritic change reads as a rename', () => {
    // Zurich -> Zürich and Sao Paulo -> São Paulo are renames and must LINK. Both
    // sides are unaccented or the accented target reads as an unrelated string.
    const unaccentCalls = helper.match(/extensions\.unaccent\(/g) ?? [];
    expect(unaccentCalls.length).toBe(2);
    // The two-arg regdictionary form is mandatory: these callers SET search_path,
    // where the one-arg form cannot find its dictionary.
    expect(helper).toContain("'extensions.unaccent'::regdictionary");
  });

  it('escapes the alias before using it as a regex', () => {
    // Real city names contain '.' and '(' -- "Frankfurt a. M.", "Rotenburg (Wümme)".
    expect(helper).toContain("'([.^$*+?()\\[\\]{}|\\\\-])', '\\\\\\1', 'g'");
  });

  it('refuses an ambiguous alias rather than picking one', () => {
    expect(helper).toMatch(/AND dc\.n = 1/);
    // Collapse to the distinct CITY first: one city may carry the same alias on
    // several rows, which would otherwise read as ambiguity.
    expect(helper).toContain('SELECT DISTINCT id, name FROM candidate');
    // min(uuid) does not exist in Postgres.
    expect(helper).toContain('(array_agg(id ORDER BY id))[1]');
  });

  it('is scoped to one country and never resolves without one', () => {
    // Country scoping is what keeps the Argentine San Juan away from the Puerto
    // Rican one. A NULL country must resolve nothing at all.
    expect(helper).toContain('WHERE p_country_id IS NOT NULL');
    expect(helper).toContain('AND c.country_id = p_country_id');
  });

  it('excludes duplicates and tmp- shells as targets', () => {
    // A `tmp-` slug is the personality-birth-place shell cohort: 1,832 rows, not one
    // with a wikidata_qid. Linking an event to one is worse than not linking.
    expect(helper).toContain('AND c.duplicate_of_id IS NULL');
    expect(helper).toContain("c.slug NOT LIKE 'tmp-%'");
  });

  it('is STABLE and SECURITY INVOKER, and anon cannot reach it', () => {
    expect(helper).toMatch(/\bSTABLE\b/);
    // It reads only reference tables from an already-gated runner, so it needs no
    // privileges of its own. A DEFINER here would be the reflex that leaked
    // safety-gated events to anon in 20290601120731.
    expect(helper).not.toMatch(/SECURITY\s+DEFINER/i);
    // CREATE FUNCTION already granted PUBLIC, so the REVOKE is what does the work.
    expect(statements).toContain(
      'REVOKE ALL ON FUNCTION public.city_by_alias(uuid, text) FROM public, anon;',
    );
  });
});

describe('run_event_city_link -- the alias arm is a fallback', () => {
  it('calls the helper', () => {
    // Without this the rule is dead code in a function nobody invokes.
    expect(runner).toContain('public.city_by_alias(');
  });

  it('runs the alias arm ONLY when the exact-name lookup found nothing', () => {
    // An exact match must always win. Order is asserted by offset, not by presence:
    // both arms exist in either arrangement, so presence proves nothing.
    const exact = runner.indexOf('lower(btrim(c.name)) = lower(btrim(r.city))');
    const fallbackGuard = runner.indexOf('if v_city is null then');
    const aliasCall = runner.indexOf('public.city_by_alias(');
    expect(exact).toBeGreaterThan(-1);
    expect(fallbackGuard).toBeGreaterThan(exact);
    expect(aliasCall).toBeGreaterThan(fallbackGuard);
  });

  it('keeps guards A and B, which the alias candidate must also pass', () => {
    // The alias arm produces a CANDIDATE. It then goes through the same
    // state-contradiction and gaycities-metro-slug checks as an exact-name
    // candidate -- that is what stops the arm from being a new way to mis-link.
    expect(runner).toContain('public.regions_contradict(r.state, v_region)');
    expect(runner).toContain('public.region_name_signal(v_region)');
    expect(runner).toContain('left(r.sub, length(v_cnorm)) = v_cnorm');
  });

  it('reads region_name for the alias candidate too', () => {
    // Guard A compares the event's state against the CANDIDATE's region. Skipping
    // this for the alias arm leaves v_region null, and a null region contradicts
    // nothing -- so guard A would silently pass for every alias link.
    const aliasCall = runner.indexOf('public.city_by_alias(');
    const tail = runner.slice(aliasCall);
    expect(tail).toMatch(
      /select c\.region_name into v_region from public\.cities c where c\.id = v_city/,
    );
  });

  it('records which arm found the city', () => {
    // An alias link is a weaker claim than an exact-name link, so it has to be
    // auditable after the fact rather than indistinguishable from one.
    expect(runner).toContain("'matched_on'");
    expect(runner).toContain("v_via := 'alias'");
    expect(runner).toMatch(/v_via := 'name'/);
  });

  it('still only ever fills a null city_id', () => {
    // coalesce(v_city, city_id) -- the runner may not overwrite an existing link.
    expect(runner).toContain('city_id = coalesce(v_city, city_id)');
    expect(runner).toContain('and e.city_id is null');
  });
});

describe('postconditions', () => {
  it('assert the exonyms this exists for actually resolve', () => {
    expect(verify).toMatch(/city_by_alias\(v_de, 'München'\)/);
    expect(verify).toContain("IS DISTINCT FROM 'Munich'");
    expect(verify).toMatch(/city_by_alias\(v_de, 'Köln'\)/);
    expect(verify).toContain("IS DISTINCT FROM 'Cologne'");
  });

  it('assert the de-qualification trap is refused', () => {
    // P3/P4 are the reason the file is not a one-line join. Each must RAISE on a
    // non-null result, which is the direction that catches a dropped guard.
    expect(verify).toMatch(
      /v_got := public\.city_by_alias\(v_us, 'Springfield'\);\s*\n\s*IF v_got IS NOT NULL THEN/,
    );
    expect(verify).toMatch(
      /v_got := public\.city_by_alias\(v_de, 'Schwerin'\);\s*\n\s*IF v_got IS NOT NULL THEN/,
    );
  });

  it('assert a null country and an empty name resolve nothing', () => {
    expect(verify).toMatch(/city_by_alias\(NULL, 'München'\) IS NOT NULL/);
    expect(verify).toMatch(
      /city_by_alias\(v_de, ''\) IS NOT NULL OR public\.city_by_alias\(v_de, NULL\) IS NOT NULL/,
    );
  });

  it('assert the runner calls the helper and keeps the exact-name arm', () => {
    // These two are deliberately SOURCE checks: a behavioural test cannot see that
    // a future CREATE OR REPLACE of the runner dropped the call while the helper
    // still exists and still works.
    expect(verify).toContain("position('city_by_alias' in v_src)");
    expect(verify).toContain("position('lower(btrim(c.name)) = lower(btrim(r.city))' in v_src)");
  });

  it('strip comments out of the source BEFORE asserting on it', () => {
    // pg_get_functiondef returns the body INCLUDING its comments, and this body
    // explains the arm in prose that names the helper, so an unstripped
    // position() test passes with the CALL deleted and the comment left standing
    // -- a postcondition that cannot fail. Proven on prod: given a body with only
    // the comment, the unstripped form matches and the stripped form does not.
    // This class aborted `db push` on main three times on 2026-09-20 and stranded
    // the whole merge queue, which is why scripts/check-functiondef-asserts.mjs
    // refuses the unstripped form outright.
    expect(verify).toContain("'--[^' || chr(10) || ']*', '', 'g')");
    expect(verify).toMatch(/v_src\s*:=\s*regexp_replace\(/);
    // No assertion may read the raw definition. The pattern is deliberately
    // broad: any `position(... in pg_get_functiondef` at all is the defect.
    expect(verify).not.toMatch(/position\([^)]*in pg_get_functiondef/);
  });

  it('assert anon cannot execute the helper', () => {
    expect(verify).toContain(
      "has_function_privilege('anon', 'public.city_by_alias(uuid,text)', 'EXECUTE')",
    );
  });

  it('raise on every failure rather than reporting it', () => {
    // A postcondition that NOTICEs is a comment. Nine checks, nine exceptions.
    const raises = verify.match(/RAISE EXCEPTION 'P\d/g) ?? [];
    expect(raises.length).toBe(9);
    // And none of the conditions may be short-circuited: `IF false` leaves every
    // string-anchored assertion above green while the check has stopped checking.
    expect(verify).not.toMatch(/\bIF\s+(false|FALSE)\b/);
  });
});
