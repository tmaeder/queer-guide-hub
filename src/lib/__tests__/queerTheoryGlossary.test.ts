// Guards the queer-theory glossary migrations against the ways they could rot.
//
// These are TEXT-SCANNING tests over the migration files, which is the
// established shape in this repo for SQL that cannot be imported (see
// citySafetyBackfill.test.ts, dedupVenueArms.test.ts). They cannot prove the
// migration APPLIED — the migration's own $verify$ blocks do that, and they run
// against real data. What these catch is a later edit quietly removing a
// load-bearing line.
//
// Every assertion here was mutation-tested: each was confirmed to FAIL when the
// line it protects is removed from the migration.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

function migration(suffix: string): string {
  const file = readdirSync(MIGRATIONS).find((f) => f.endsWith(suffix));
  if (!file) throw new Error(`no migration ending in ${suffix}`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

const CATEGORY = migration('_theory_scholarship_category.sql');
const GLOSSARY = migration('_queer_theory_glossary.sql');
const SCHOLARS = migration('_queer_theory_scholars.sql');

// Terms this pass publishes. If one is dropped from the migration the glossary
// silently loses a page, which is the failure the whole change exists to fix.
const REVIVED = [
  'queer-theory',
  'homonormativity',
  'homonationalism',
  'performativity',
  'gender-performativity',
  'cisnormativity',
  'disidentification',
  'lesbian-feminism',
  'queer-ecology',
  'queer-pedagogy',
  'social-construction-of-gender',
  'asexual-studies',
  'ecofeminism',
  'gender-theory',
  'homophile',
  'queer-musicology',
  'sex-positivity',
];
const CREATED = [
  'quare-theory',
  'queer-of-color-critique',
  'queer-archaeology',
  'queer-theology',
  'neuroqueer-theory',
  'crip-theory',
  'critical-disability-theory',
  'disability-studies',
  'compulsory-heterosexuality',
  'human-sexuality',
  'transgender-studies',
];

describe('theory-scholarship category', () => {
  it('is a level-1 child of history-rights', () => {
    expect(CATEGORY).toMatch(/slug = 'history-rights'/);
    expect(CATEGORY).toMatch(/'theory-scholarship'/);
    expect(CATEGORY).toMatch(/level = 1 and parent_id = v_parent/);
  });

  // A sense category means "the generic English sense is evidence of the WRONG
  // subject". For theory the scholarly sense IS the subject, so enrolling this
  // slug would make the generic-sense gate refuse correct grounding.
  it('is NOT enrolled as a sense category', () => {
    const style = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/tag-style.ts'),
      'utf8',
    );
    const senseSet = style.slice(
      style.indexOf('SENSE_CATEGORY_KEYS'),
      style.indexOf('export function isSenseCategory'),
    );
    expect(senseSet).not.toContain('theory-scholarship');
    expect(senseSet).not.toContain('theory & scholarship');
    // positive control: the set is non-empty and really is the one we think
    expect(senseSet).toContain('fetishes-interests');
  });
});

describe('glossary migration', () => {
  it('revives and creates every intended term', () => {
    for (const slug of [...REVIVED, ...CREATED]) {
      expect(GLOSSARY, `missing ${slug}`).toContain(`'${slug}'`);
    }
  });

  // The four columns must move together. status alone leaves the row out of
  // search (the indexer keys on deprecated_at); without human_reviewed,
  // deprecate_unused_tags re-hides it and the migration is a no-op.
  it('revival clears deprecated_at AND sets human_reviewed', () => {
    const revive = GLOSSARY.slice(GLOSSARY.indexOf('2a. revive'), GLOSSARY.indexOf('2b.'));
    expect(revive).toMatch(/status\s*=\s*'active'/);
    expect(revive).toMatch(/human_reviewed\s*=\s*true/);
    expect(revive).toMatch(/deprecated_at\s*=\s*null/);
    expect(revive).toMatch(/deprecation_reason\s*=\s*null/);
  });

  // Reviving queer-theory is impossible while queerness holds its slug as an
  // alias: tag_reject_alias_shadow raises and aborts the whole transaction.
  // Confirmed live against prod.
  it('drops the queerness alias before reviving queer-theory', () => {
    const aliasDelete = GLOSSARY.indexOf('delete from public.tag_aliases where id = v_alias');
    const revive = GLOSSARY.indexOf('2a. revive');
    expect(aliasDelete).toBeGreaterThan(-1);
    expect(aliasDelete).toBeLessThan(revive);
    // and its search_synonyms row goes first — that FK is ON DELETE SET NULL
    expect(GLOSSARY.indexOf('delete from public.search_synonyms')).toBeLessThan(aliasDelete);
  });

  it('clears every wrong-entity QID rather than repointing it', () => {
    for (const slug of ['queerness', 'disidentification', 'gender-theory']) {
      expect(GLOSSARY).toContain(`'${slug}'`);
    }
    expect(GLOSSARY).toMatch(/wikidata_id = null/);
    // crip-theory must carry no QID: the only candidate is the reclaimed slur
    // and it fails titleAgrees() twice over.
    expect(GLOSSARY).toMatch(/\('crip-theory', 'Crip Theory', null,/);
  });

  // merge_tag_concept unconditionally aliases the loser's NAME onto the winner.
  // Both rows here are named "Queer Theory", so the alias would equal its own
  // canonical's name and breach the alias_equals_name zero-invariant.
  it('deletes the merge auto-alias', () => {
    expect(GLOSSARY).toMatch(
      /delete from public\.tag_aliases[\s\S]{0,200}lower\(alias_name\) = 'queer theory'/,
    );
  });

  it('files all three category surfaces, not just category_id', () => {
    const refile = GLOSSARY.slice(GLOSSARY.indexOf('2d. refile'), GLOSSARY.indexOf('2e.'));
    expect(refile).toMatch(/category_id\s*=\s*v_rel/);
    expect(refile).toMatch(/category\s*=\s*\(select name from public\.tag_categories/);
    expect(refile).toMatch(/insert into public\.tag_category_assignments/);
  });

  it('asserts the invariants that CI enforces corpus-wide', () => {
    expect(GLOSSARY).toMatch(/indexable row\(s\) corpus-wide have no description/);
    expect(GLOSSARY).toMatch(/alias\(es\) equal their own tag name/);
    expect(GLOSSARY).toMatch(/duplicate_active_name is/);
  });

  // The duplicate-QID assertion must be SCOPED to the rows this migration
  // touches. Written corpus-wide it fails the deploy on somebody else's debt:
  // prod already carries 27 duplicate-QID pairs across active tags, none of them
  // related to this change.
  it('scopes the duplicate-QID assertion to the touched rows', () => {
    expect(GLOSSARY).toMatch(/this change leaves a duplicate QID on active tags/);
    expect(GLOSSARY).not.toMatch(/glossary: duplicate QID across active tags/);
    // it is scoped by an IN-list, not by a bare group-by over the whole table
    const block = GLOSSARY.slice(GLOSSARY.indexOf('-- 5. No duplicate identifier'));
    expect(block).toMatch(/t2\.slug in \(/);
  });

  // queer-people-of-color is deprecated but its slug is an APPROVED synonym
  // alias of the live tag `qpoc` — a curator's routing decision. Reviving it
  // would raise on the shadow trigger and undo a human's merge.
  it('does not revive queer-people-of-color', () => {
    const revive = GLOSSARY.slice(GLOSSARY.indexOf('2a. revive'), GLOSSARY.indexOf('2b.'));
    expect(revive).not.toContain('queer-people-of-color');
  });
});

describe('scholars migration', () => {
  it('gives Sedgwick and Warner a bio before publishing them', () => {
    const bios = SCHOLARS.slice(0, SCHOLARS.indexOf('2. new rows'));
    expect(bios).toContain('eve-kosofsky-sedgwick');
    expect(bios).toContain('michael-warner');
    expect(bios).toMatch(/Epistemology of the Closet/);
    expect(bios).toMatch(/heteronormativity/);
    expect(SCHOLARS).toMatch(/empty bio on: %/);
  });

  // publish_personality_with_consent is gated on has_any_role_jwt(['admin']) and
  // raises 42501 under db push — measured. promote_personality sets
  // needs_attention=true, which the public gate then silently demotes.
  it('publishes by direct UPDATE, not through either broken RPC', () => {
    expect(SCHOLARS).not.toMatch(/perform public\.publish_personality_with_consent/);
    expect(SCHOLARS).not.toMatch(/perform public\.promote_personality/);
    expect(SCHOLARS).toMatch(/needs_attention = false/);
    expect(SCHOLARS).toMatch(/coalesce\(p\.review_status, ''\) <> 'archived'/);
    expect(SCHOLARS).toMatch(/'non_person'/);
  });

  // The gate demotes without raising, so the UPDATE succeeding proves nothing.
  it('re-reads visibility after publishing', () => {
    expect(SCHOLARS).toMatch(/still not public after publish/);
  });

  it('restates person_outing_guard so this migration fails before the release gate', () => {
    expect(SCHOLARS).toMatch(/breach person_outing_guard/);
    expect(SCHOLARS).toMatch(/'community_member','ally','activist','representation'/);
    expect(SCHOLARS).toMatch(/!~ '\^SKIP_'/);
  });

  // Wikidata year-only precision must not be padded to January 1st: once stored,
  // a padded date is indistinguishable from a measured one.
  it('stores no padded January-1st birthdays', () => {
    const people = SCHOLARS.slice(
      SCHOLARS.indexOf('2. new rows'),
      SCHOLARS.indexOf('3. publish drafts'),
    );
    expect(people).not.toMatch(/'\d{4}-01-01'/);
  });

  it('writes both tag surfaces so the link is visible and countable', () => {
    expect(SCHOLARS).toMatch(/set tags = \(select array_agg\(distinct x\)/);
    expect(SCHOLARS).toMatch(/insert into public\.unified_tag_assignments/);
    expect(SCHOLARS).toMatch(/'personality'/);
  });

  it('does not add the contested or unsourceable people', () => {
    expect(SCHOLARS).not.toMatch(/\('andrea-smith'/);
    expect(SCHOLARS).not.toMatch(/\('nick-walker'/);
    // ...and says why, so the omission is a decision and not an oversight
    expect(SCHOLARS).toMatch(/DELIBERATELY ABSENT/);
  });
});
