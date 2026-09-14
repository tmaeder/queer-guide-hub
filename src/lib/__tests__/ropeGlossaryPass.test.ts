import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the rope / kink glossary comparison against seven external glossaries
 * (rebornropes.com A-Z + "A is for" + positions, skillfullybound.com,
 * fetbomb.com, naturallynaughty.shop Kinkipedia, lioness.io).
 *
 *   50200101100500  corrects rows that are LIVE and rendering. Every one has a
 *                   CORRECT `description` and a short/long description about a
 *                   different subject — /tags/suspension served a correct
 *                   definition of rope suspension followed by four sentences
 *                   about website account bans. These assertions exist to stop
 *                   those overwrites from ever becoming unconditional.
 *
 *   50200101100600  revives thirteen terms the 2026-06-05 orphan audit killed.
 *                   Eight carried the generic or wrong sense in their PUBLISHED
 *                   prose, so the load-bearing property is that the prose is
 *                   fixed BEFORE the revive — a blanket revive would have
 *                   published business negotiation on the consent term.
 *
 *   50200101100700  creates sixteen rows. The junction must be written
 *                   explicitly, because neither category trigger fires on
 *                   INSERT and is_adult derives from the junction.
 *
 *   50200101100800  the sentinel for the prose a disowned entity left behind.
 *
 * Assertions run against COMMENT-STRIPPED SQL. Every header quotes the
 * statements it describes almost verbatim, so a bare toContain over the whole
 * file passes with the real statement deleted — the vacuous-assertion class
 * that 29000101100000, 20360401100300 and 20361124161700 all hit.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const PROSE = '50200101100500_rope_glossary_wrong_subject_prose.sql';
const REVIVE = '50200101100600_revive_core_kink_vocabulary.sql';
const VOCAB = '50200101100700_rope_technique_vocabulary.sql';
const SENTINEL = '50200101100800_tag_disowned_prose_signals.sql';

/** Line comments only; these files use no block comments. */
const statementsOf = (file: string): string =>
  readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

describe('wrong-subject prose on live rows', () => {
  const sql = statementsOf(PROSE);

  it('declares a non-system actor', () => {
    // Every row touched is human_reviewed=true, and log_unified_tag_change()
    // RAISEs when an actor matching 'system:%' modifies such a row.
    expect(sql).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'migration:[^']+'/);
  });

  it.each([
    ['suspension', /long_description like 'Suspension is an action taken by a website%'/],
    ['grounding', /short_description = 'Ship impact on seabed or waterway side'/],
    ['redding-out', /short_description = 'Social event for LGBTQ\+ community'/],
    ['rope-eel', /short_description = 'Rope eel, a type of fish'/],
    ['harness', /short_description = 'Protective clothing or armor worn on the body'/],
    ['rope-bottom', /short_description = 'Rope bottom in art'/],
    ['property', /short_description = 'Legal control of valuable things'/],
    ['bottom', /short_description = 'Family name or surname'/],
  ])('only rewrites %s if it still carries the wrong subject', (slug, guard) => {
    // An unguarded UPDATE would overwrite a row a human has since corrected.
    const i = sql.indexOf(`where slug = '${slug}'`);
    expect(i).toBeGreaterThan(-1);
    expect(sql.slice(i, i + 400)).toMatch(guard);
  });

  it('nulls the four wrong identifiers rather than repointing them', () => {
    // tag_medical_codes_sync and tag_wikidata_hierarchy rebuild weekly from
    // wikidata_id, so a plausible-but-wrong QID regenerates wrong data forever
    // while a null one regenerates nothing.
    for (const qid of ['Q485027', 'Q64555914', 'Q937228', 'Q61286643', 'Q14920473']) {
      expect(sql).toMatch(new RegExp(`wikidata_id = '${qid}'`)); // only in the assertion
    }
    // …and never as a write.
    expect(sql).not.toMatch(/wikidata_id\s*=\s*'Q\d+'\s*,/);
    expect(sql).toMatch(/wikidata_id\s*=\s*null/);
  });

  it('fails loudly if any wrong subject survived', () => {
    expect(sql).toMatch(
      /raise exception 'rope wrong-subject prose: % row\(s\) still carry the wrong subject'/,
    );
  });

  it('fails loudly if any wrong identifier survived', () => {
    // Without this the weekly Wikidata syncs rebuild from the QID and undo the
    // repair on a schedule, silently.
    expect(sql).toMatch(
      /raise exception 'rope wrong-subject prose: % wrong identifier\(s\) survived'/,
    );
  });

  it('asserts nothing lost its prose gate', () => {
    // long_description is nulled on indexable rows. tag_has_prose() reads
    // description and short_description only, so that is safe — but it is
    // asserted rather than trusted, because enforce_tag_thin_page_gate would
    // otherwise silently deindex a live page and stamp it 'thin'.
    expect(sql).toMatch(/not public\.tag_has_prose\(description, short_description\)/);
    expect(sql).toMatch(
      /raise exception 'rope wrong-subject prose: % row\(s\) lost their prose gate'/,
    );
  });

  it('degenders crotch-rope and breast-bondage while KEEPING their identifiers', () => {
    // Both carry the CORRECT Wikidata entity; only the prose copied from its
    // upstream description is narrow. Nulling a right QID would be the opposite
    // error from the one this file exists to fix.
    // Scoped to each statement itself: a window that merely reaches BACK from
    // the where-clause picks up the preceding UPDATE, which legitimately nulls
    // an identifier, and the assertion then proves nothing about this one.
    for (const slug of ['crotch-rope', 'breast-bondage']) {
      const end = sql.indexOf(`where slug = '${slug}'`);
      const start = sql.lastIndexOf('update public.unified_tags set', end);
      expect(start).toBeGreaterThan(-1);
      expect(sql.slice(start, end)).not.toMatch(/wikidata_id/);
    }
  });

  it('records why each row was overwritten', () => {
    expect(sql).toMatch(/insert into public\.tag_sources/);
    expect(sql).toMatch(/migration 50200101100500/);
  });
});

describe('reviving the orphan-audit cohort', () => {
  const sql = statementsOf(REVIVE);

  it('fixes the wrong-sense prose before the revive, not after', () => {
    // Ordering is the whole point: the revive makes these rows readable, so a
    // revive that ran first would publish the business sense of "negotiation"
    // and horse-training prose on "whip" for as long as the transaction took.
    const firstProseFix = sql.indexOf("where slug = 'negotiation'");
    const revive = sql.indexOf("status              = 'active'");
    expect(firstProseFix).toBeGreaterThan(-1);
    expect(revive).toBeGreaterThan(firstProseFix);
  });

  it.each([
    [
      'negotiation',
      /long_description like 'Negotiation is a dialogue between two or more parties%'/,
    ],
    ['whip', /long_description like '%commonly used on horses%'/],
    ['pvc', /long_description like '%Norwegian musical group%'/],
    ['mummification', /short_description = 'Preserved dead body or animal'/],
    ['hemp-rope', /long_description like '%sailing and landscaping%'/],
    ['obedience', /long_description like 'Obedience is a form of social influence%'/],
  ])('guards the %s rewrite on its own defect', (slug, guard) => {
    const i = sql.indexOf(`where slug = '${slug}'`);
    expect(i).toBeGreaterThan(-1);
    expect(sql.slice(i, i + 300)).toMatch(guard);
  });

  it('refuses to republish the wrong sense', () => {
    // The assertion that would have caught a blanket revive.
    expect(sql).toMatch(
      /raise exception 'revive core kink vocabulary: % row\(s\) would have republished the wrong sense'/,
    );
  });

  it('clears status, deprecated_at and deprecation_reason together', () => {
    // Clearing only status is what produced the 297-tag resurrection that left
    // rows active with a deprecation stamp still on them.
    const i = sql.indexOf("status              = 'active'");
    const stmt = sql.slice(i, i + 500);
    expect(stmt).toMatch(/deprecated_at\s+= null/);
    expect(stmt).toMatch(/deprecation_reason\s+= null/);
  });

  it('sets seo_indexable EXPLICITLY and leaves the revived rows unpublished', () => {
    // 20361001100100 revived eight terms without touching this column and left
    // them invisible to crawlers with nothing to self-heal them. Here the
    // intent is the opposite — unpublished on purpose — and either way the
    // column must be written rather than inherited.
    const i = sql.indexOf("status              = 'active'");
    expect(sql.slice(i, i + 500)).toMatch(/seo_indexable\s+= false/);
    expect(sql).toMatch(
      /raise exception 'revive core kink vocabulary: % row\(s\) are indexable or unreviewed'/,
    );
  });

  it('marks the revived rows human_reviewed so the cull does not take them again', () => {
    // deprecate_unused_tags() selects exactly status='active' AND
    // human_reviewed=false AND usage_count=0, and all thirteen are usage 0.
    const i = sql.indexOf("status              = 'active'");
    expect(sql.slice(i, i + 500)).toMatch(/human_reviewed\s+= true/);
  });

  it('writes BOTH category representations for the three uncategorised rows', () => {
    // /tags/:slug renders the JUNCTION and the search facet renders the TEXT
    // column, so a revived row with only one of them is uncategorised on its
    // own page and categorised in search.
    expect(sql).toMatch(/insert into public\.tag_category_assignments/);
    expect(sql).toMatch(
      /raise exception 'revive core kink vocabulary: % row\(s\) have no category or no primary junction'/,
    );
  });
});

describe('rope technique vocabulary', () => {
  const sql = statementsOf(VOCAB);

  it('aborts rather than overwriting a live tag', () => {
    expect(sql).toMatch(
      /raise exception 'rope vocab: % slug\(s\) already exist and are not deprecated'/,
    );
  });

  it('aborts if a slug is held as an alias of another tag', () => {
    // trg_tag_reject_alias_shadow would otherwise raise mid-loop.
    expect(sql).toMatch(
      /raise exception 'rope vocab: % slug\(s\) are held as an alias of another tag'/,
    );
  });

  it('writes the category junction explicitly on insert', () => {
    // sync_tag_category_assignment_after is scoped AFTER UPDATE OF category_id
    // and does not fire for a new row, so an INSERT files nothing in the
    // junction — and unified_tags_recompute_is_adult() is a trigger on that
    // junction, so the row would derive is_adult=false.
    const loop = sql.slice(sql.indexOf('for r in select * from _new'), sql.indexOf('Hard Point'));
    expect(loop).toMatch(
      /insert into public\.tag_category_assignments \(tag_id, category_id, is_primary\)/,
    );
  });

  it('asserts the age gate rather than assuming it', () => {
    // The assertion that caught box-tie publishing with no age gate in
    // 20290201100000, which is the only reason it is here.
    expect(sql).toMatch(/t\.is_adult is not true/);
    expect(sql).toMatch(/raise exception 'rope vocab: % row\(s\) published without the age gate'/);
  });

  it('asserts the expected row count instead of trusting the loop', () => {
    expect(sql).toMatch(/if v_made <> 16 then/);
  });

  it('guards the hardpoint revive on its placeholder prose', () => {
    // The row defines the term with the term: description 'Toys tag',
    // long_description 'Hardpoint'.
    const i = sql.indexOf("where t.slug = 'hardpoint'");
    expect(sql.slice(i, i + 200)).toMatch(/and t\.description = 'Toys tag'/);
    expect(sql).toMatch(
      /raise exception 'rope vocab: hardpoint still carries its placeholder prose'/,
    );
  });

  it('writes aliases as approved, not auto', () => {
    // Since 20261012090000 display, auto-tagging and the search bridge are ALL
    // approved-only, so an `auto` alias here would be inert and route nothing.
    const loop = sql.slice(sql.indexOf('Takatekote'));
    expect(loop).toMatch(/'approved'/);
    expect(loop).not.toMatch(/,\s*'auto'\s*\)/);
  });

  it('refuses to mint an alias that shadows an existing tag name', () => {
    const loop = sql.slice(sql.indexOf('Takatekote'));
    expect(loop).toMatch(/not exists \(select 1 from public\.unified_tags u/);
    expect(loop).toMatch(/dedup_despace\(u\.name\) = public\.dedup_despace\(r\.alias_name\)/);
  });

  it('skips rather than fails when a canonical is not active', () => {
    const loop = sql.slice(sql.indexOf('Takatekote'));
    expect(loop).toMatch(/t\.status = 'active'/);
  });
});

describe('the disowned-prose sentinel', () => {
  const sql = statementsOf(SENTINEL);

  it('reports a broken probe separately from a clean corpus', () => {
    // An empty audit table, a revoked grant and a repaired corpus otherwise all
    // produce the same reassuring zero — the accessibility_contradictions
    // lesson.
    expect(sql).toMatch(/'probe_ok', true/);
    expect(sql).toMatch(/'probe_ok', false/);
    expect(sql).toMatch(/'audit_rows'/);
  });

  it('answers rather than throwing, so the health script can tell them apart', () => {
    expect(sql).toMatch(/exception when others then/);
  });

  it('is service_role only', () => {
    // A SECURITY DEFINER aggregate granted to `authenticated` is granted to
    // every signed-in member of the site.
    expect(sql).toMatch(
      /revoke all on function public\.tag_disowned_prose_signals\(\) from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.tag_disowned_prose_signals\(\) to service_role/,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.tag_disowned_prose_signals\(\) to authenticated/,
    );
  });

  it('carries a positive control so a broken join cannot read as a clean corpus', () => {
    expect(sql).toMatch(/the repair audit is empty — the probe has nothing to join against/);
  });

  it('asserts every key the health script reads', () => {
    for (const key of [
      'audit_rows',
      'active_repaired',
      'sd_surviving',
      'ld_surviving',
      'indexable_surviving',
    ]) {
      expect(sql).toMatch(new RegExp(`'${key}'`));
    }
    expect(sql).toMatch(/missing a key the health check reads/);
  });
});

describe('the health-check wiring', () => {
  const js = readFileSync(join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'), 'utf8');

  it('hard-fails on a missing RPC rather than skipping', () => {
    expect(js).toMatch(/tag_disowned_prose_signals → HTTP/);
  });

  it('hard-fails on growth and only warns on the standing backlog', () => {
    // A ratchet: the backlog can only be worked down by hand, so a rule that
    // failed on any non-zero value would be red from the day it shipped and
    // would be scrolled past. Growth means a producer is writing NEW prose from
    // a disowned entity, which is a live regression.
    expect(js).toMatch(/const DISOWNED_PROSE_CEILING = \d+/);
    // The COMPARISON, not just the message. Asserting the error string alone
    // leaves the ratchet disableable with the test still green — which is what
    // mutation testing this file actually found.
    expect(js).toMatch(/if \(sd > DISOWNED_PROSE_CEILING\) \{/);
    expect(js).toMatch(/above the \$\{DISOWNED_PROSE_CEILING\} ceiling/);
    // …and the failure must actually be recorded, not merely printed.
    const guard = js.slice(js.indexOf('if (sd > DISOWNED_PROSE_CEILING)'));
    expect(guard.slice(0, 500)).toMatch(/FAILED = true/);
    const block = js.slice(js.indexOf('const DISOWNED_PROSE_CEILING'));
    expect(block).toMatch(/console\.warn\(`⚠ \$\{sd\} active tags still carry/);
  });

  it('treats an empty repair audit as a failure, not a clean corpus', () => {
    const block = js.slice(js.indexOf('const DISOWNED_PROSE_CEILING'));
    expect(block).toMatch(/the repair audit is empty, so the zeroes below measure nothing/);
  });
});
