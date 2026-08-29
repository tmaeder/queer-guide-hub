import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards `*_chemsex_harm_reduction_source_pass.sql`.
 *
 * The migration writes ~30 rows across the chemsex / harm-reduction corner of the
 * glossary from two cited documents (AIDS Action Europe's 2023 training manual and the
 * 2018 Chemsex First Aid action sheet). Almost every rule it follows is one that reads
 * as arbitrary from the diff and is load-bearing in production:
 *
 *  1. A STREET NAME THAT IS AN ORDINARY ENGLISH WORD MUST BE `auto`, NEVER `approved`.
 *     `approved` is a single gate serving two purposes — synonym display AND the
 *     auto-tagging rule — so approving "Glass" or "K" or "G" makes every venue write-up
 *     containing those words self-tag as a hard drug. This is the same collision that
 *     keeps Speed, Acid and Ice unapproved elsewhere in the corpus.
 *
 *  2. "Speed" IS NOT METHAMPHETAMINE HERE. The manual lists it as a meth street name,
 *     but /tags/amphetamine is a separate live tag and in most of Europe "speed" means
 *     that. Adding it would mis-tag in whichever direction it fired.
 *
 *  3. THE REVIVAL SET IS NAMES, NOT PROSE. The 2026-06-05 orphan sweep deprecated ~30
 *     rows here on a zero-usage test, and the 2026-04-27 bulk sweep had already given
 *     every one of them plausible prose. Prose is therefore not evidence of merit. The
 *     "Chemsex + X" topic-phrases must stay deprecated or /tags/chemsex shards across a
 *     dozen near-synonyms; the test pins the specific ones that were considered.
 *
 *  4. SEROSORTING IS NOT REVIVED. /tags/seroadaptation already carries "Serosorting" as
 *     an approved alias. Reviving the deprecated tag would put a live tag and a live
 *     alias behind the same word.
 *
 *  5. AN INSERT MUST WRITE ALL THREE FILING LAYERS. The category sync triggers on
 *     unified_tags are UPDATE-only, so an INSERT propagates nothing: `category_id`
 *     alone leaves the search facet blank, `category` alone leaves the page
 *     uncategorised, and neither writes the junction row the detail page renders from.
 *
 *  6. SENSITIVE ROWS MUST SHIP `human_reviewed`. `enforce_tag_seo_sensitivity_gate()`
 *     forces `seo_indexable = false` on any sensitive row that is not human-reviewed,
 *     so dropping that flag would deindex the entire cohort silently.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** Located by SUFFIX, never by version: migrations get renumbered when they wait
 *  behind another PR, and a version-pinned path turns that into a red test. */
const FILE = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('_chemsex_harm_reduction_source_pass.sql'))
  .sort()
  .pop();
if (!FILE) throw new Error('no *_chemsex_harm_reduction_source_pass.sql migration found');

const sql = readFileSync(join(MIGRATIONS, FILE), 'utf8');

/** The migration minus its `--` comment lines, so prose cannot satisfy a test. */
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const statements = code
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

/** Every `('tag-slug', 'Alias Name', 'alias-slug', 'type', 'status')` tuple. */
const aliasRows = [
  ...code.matchAll(
    /\(\s*'([a-z0-9-]+)'\s*,\s*'([^']+)'\s*,\s*'([a-z0-9-]+)'\s*,\s*'(\w+)'\s*,\s*'(auto|approved)'\s*\)/g,
  ),
].map(([, tagSlug, aliasName, aliasSlug, aliasType, review]) => ({
  tagSlug,
  aliasName,
  aliasSlug,
  aliasType,
  review,
}));

describe('chemsex harm-reduction source pass', () => {
  it('cites both sources', () => {
    expect(sql).toContain('AIDS Action Europe');
    expect(sql).toContain('Chemsex First Aid');
  });

  it('carries no explicit BEGIN/COMMIT', () => {
    // db push wraps each migration in its own transaction; an explicit commit lands the
    // data while the schema_migrations row rolls back with it, producing drift that
    // reds every PR in the repo until it is recovered by hand.
    expect(code).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });

  it('parsed the alias table it is about to assert on', () => {
    // A positive control. Without it every alias assertion below passes vacuously the
    // moment the tuple shape changes.
    expect(aliasRows.length).toBeGreaterThanOrEqual(20);
    expect(aliasRows.some((r) => r.tagSlug === 'ghb')).toBe(true);
  });

  it('never approves an ordinary English word as a street name', () => {
    // Approval is the auto-tagging rule. These are all real street names and all real
    // English words; the corpus is full of prose that uses them innocently.
    const ordinary = new Set(['g', 'k', 'glass', 'crank', 'tweak', 'bubbles', 'gina']);
    const wrong = aliasRows.filter((r) => ordinary.has(r.aliasSlug) && r.review !== 'auto');
    expect(
      wrong.map((r) => `${r.aliasName} -> ${r.tagSlug} (${r.review})`),
      'ordinary-word street names must stay unapproved',
    ).toEqual([]);
    // And they must actually be present, or the rule above guards nothing.
    expect(aliasRows.filter((r) => ordinary.has(r.aliasSlug)).length).toBeGreaterThanOrEqual(5);
  });

  it('never files "Speed" under methamphetamine', () => {
    expect(aliasRows.some((r) => r.aliasName.toLowerCase() === 'speed')).toBe(false);
    // Nor "Drone" for mephedrone, which collides with the live /tags/drone.
    expect(aliasRows.some((r) => r.aliasSlug === 'drone')).toBe(false);
  });

  it('adds no self-alias', () => {
    // An alias whose slug equals its own tag's slug renders as a tag being a synonym of
    // itself. The shadow trigger only catches the cross-tag case.
    const selfish = aliasRows.filter((r) => r.aliasSlug === r.tagSlug);
    expect(selfish.map((r) => r.aliasSlug)).toEqual([]);
  });

  it('revives only source-attested single terms', () => {
    const revive = statements.find(
      (s) => s.includes('deprecated_at = null') && s.includes("status = 'active'"),
    );
    expect(revive, 'the revival UPDATE was not found').toBeDefined();
    for (const slug of ['cathinones', 'k-hole', 'drug-induced-psychosis', 'chillout-room']) {
      expect(revive).toContain(slug);
    }
    // The LLM topic-phrase cohort the same sweep deprecated, which must stay deprecated.
    for (const rejected of [
      'chemsex-harm-reduction',
      'safer-chemsex-practices',
      'chemsex-culture',
      'chemsex-parties',
      'chemsex-related-issues',
      'cultural-competence-in-chemsex-care',
      'peer-support-in-chemsex-recovery',
      'comedown-care',
      'polydrug-dangers',
      'safer-use-and-overdose-prevention-training',
    ]) {
      // Matched as a quoted SQL literal, not as a substring: the actor string
      // 'editorial:chemsex-harm-reduction-source-pass-2026' contains one of these
      // names and a bare substring test fails on the unmutated file.
      expect(code, `${rejected} must not be revived`).not.toContain(`'${rejected}'`);
    }
  });

  it('does not revive serosorting, which is already an alias of seroadaptation', () => {
    const revive = statements.find(
      (s) => s.includes('deprecated_at = null') && s.includes("status = 'active'"),
    )!;
    expect(revive).not.toContain('serosorting');
  });

  it('writes all three filing layers on INSERT', () => {
    const insert = statements.find((s) => s.includes('insert into unified_tags'));
    expect(insert, 'the new-tag INSERT was not found').toBeDefined();
    expect(insert).toMatch(/\bcategory\b/);
    expect(insert).toMatch(/\bcategory_id\b/);
    // The junction row is a separate statement fed from the INSERT's RETURNING.
    expect(insert).toContain('returning id, category_id');
    expect(code).toContain('insert into tag_category_assignments');
  });

  it('resolves categories by name rather than hardcoding their uuids', () => {
    expect(code).toContain('join tag_categories c on c.name');
    expect(code).not.toMatch(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/);
  });

  it('publishes sensitive rows as human_reviewed and indexable', () => {
    // Otherwise enforce_tag_seo_sensitivity_gate() deindexes them on the way in.
    const insert = statements.find((s) => s.includes('insert into unified_tags'))!;
    expect(insert).toContain('human_reviewed');
    expect(insert).toContain('seo_indexable');
    expect(code).toMatch(/is_sensitive\s*=\s*true/);
    expect(code).toContain('published un-reviewed and so deindexed');
  });

  it('repairs both known post-merge defects', () => {
    expect(code).toContain('merge_tag_concept');
    // (a) the loser's primary category assignment rides along as a second primary;
    const demote = statements.find(
      (s) => s.includes('update tag_category_assignments') && s.includes('is_primary = false'),
    );
    expect(demote, 'the two-primaries demote was not found').toBeDefined();
    // (b) the loser's aliases are left pointing at the retired row.
    const reparent = statements.find(
      (s) => s.includes('update tag_aliases') && s.includes('canonical_tag_id = v_canonical'),
    );
    expect(reparent, 'the alias re-parent was not found').toBeDefined();
  });

  it('uses only the relation types both CHECK constraints allow', () => {
    // tag_relations carries two overlapping CHECKs; `broader` and `related` are the
    // whole of their intersection, so `narrower`/`similar`/`distinct_from` would abort.
    const rel = statements.find((s) => s.includes('insert into tag_relations'));
    expect(rel, 'the relations INSERT was not found').toBeDefined();
    const types = [
      ...rel!.matchAll(/'(broader|related|narrower|similar|distinct_from|exact_match)'/g),
    ].map((m) => m[1]);
    expect(types.length).toBeGreaterThan(10);
    expect([...new Set(types)].sort()).toEqual(['broader', 'related']);
  });

  it('declares a non-system actor, and re-declares it after the merge', () => {
    // log_unified_tag_change() RAISEs when a `system:%` actor touches a human_reviewed
    // row, and most of this corner is human_reviewed. merge_tag_concept() overwrites
    // app.actor with its own value for the rest of the transaction.
    const decls = [...code.matchAll(/set local app\.actor = '([^']+)'/g)].map((m) => m[1]);
    expect(decls.length).toBeGreaterThanOrEqual(2);
    for (const a of decls) expect(a.startsWith('system:')).toBe(false);
  });

  it('asserts its own outcome, and the safety properties at zero', () => {
    expect(code).toContain('raise exception');
    expect(code).toContain('more than one primary category');
    expect(code).toContain('self-aliases');
    expect(code).toContain('party-and-play is still a live tag');
  });

  it('states the corpus counts as lower bounds', () => {
    // Sibling sessions edit this table concurrently. An equality assertion turns
    // someone else's unrelated write into a failed deploy.
    expect(code).toMatch(/if v_n < 13 then/);
    expect(code).not.toMatch(/if v_n <> \d+ then/);
  });
});
