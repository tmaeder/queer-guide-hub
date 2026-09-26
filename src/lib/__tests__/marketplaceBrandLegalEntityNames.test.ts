import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the two migrations that took the legal-entity names off 49 maker pages
 * and then consolidated the 9 duplicate titles the rename created.
 *
 * WHY A TEXT SCAN. Both files are one-shot data repairs with no runtime surface,
 * so there is nothing to unit-test behaviourally; what can rot is the SHAPE of
 * the repair. Checks run against the repo, not the database, so this needs no
 * credentials in CI — same pattern as `nonplaceCityDeletion.test.ts` and
 * `citySafetyBackfill.test.ts`.
 *
 * WHY THESE ASSERTIONS AND NOT OTHERS. Each is anchored to a decision that a
 * later editor could plausibly undo without noticing:
 *
 *   - THE RENAME MUST NOT TOUCH IDENTITY. `brand_key` is GENERATED over
 *     `marketplace_listings.brand`, and `marketplace_brands.slug` derives from
 *     `brand_key` under a UNIQUE index, so re-keying MOVES the maker page URL —
 *     and there is no brand slug-redirect table, so a moved slug is a hard 404
 *     on a URL `sitemap-brands.xml` advertises. The whole reason the fix is a
 *     `display_name` rename is that it moves no URL, so migration 1 must never
 *     write `brand_key`, `slug`, or `marketplace_listings.brand`.
 *   - EVERY UPDATE MUST BE CONTENT-GUARDED. The rename keys on the CURRENT
 *     `display_name`. That is what makes the file idempotent and what stops it
 *     overwriting a name a human sets later.
 *   - THE STRUCK ROWS MUST STAY STRUCK. 22 of the 71 machine-surfaced candidates
 *     were rejected by hand for distinct reasons — a multi-brand distributor, a
 *     suffix that is part of the real name, a title prefix that is a product
 *     name. A sweep that renamed more than the reviewed 49 would still satisfy
 *     "49 rows reached", so the controls carry the invariant.
 *   - CONSOLIDATION MUST CHECK ITS PRECONDITION. Re-keying is safe in migration
 *     2 only because each canonical target already exists as an approved,
 *     slugged row. Copy that file for a pair where it does not and you silently
 *     delete a maker page; the precondition is what makes it fail loudly.
 *   - THE POSITIVE CONTROL. A "no legal-entity names remain" style assertion
 *     passes just as happily against a file that renamed nothing, so the counts
 *     are asserted upward too.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const RENAME = join(MIGRATIONS, '20260919193550_marketplace_brand_names_are_legal_entities.sql');
const CONSOLIDATE = join(MIGRATIONS, '20260919194058_marketplace_brand_dup_consolidate.sql');

/** Strip `--` comments so a guard can never be satisfied by the prose describing it. */
function statementsOf(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

/**
 * Does any statement ASSIGN this column?
 *
 * A first draft asked `/set[^;]*brand_key\s*=/` and it was vacuous in the worst
 * direction: `[^;]*` happily crosses newlines, so it ran from a `set` on one
 * line into `where l.brand_key = c.artifact_key` on the next and reported an
 * assignment that does not exist. Same `[^;]*` trap CLAUDE.md records from the
 * venue-dedup pass, where the class spans a semicolon inside a message.
 *
 * Line-scoped instead, which is exact for this corpus because every assignment
 * in these files sits on its own line, and it cannot be satisfied by a WHERE or
 * by `is distinct from`.
 */
function assignsColumn(sql: string, column: string): boolean {
  const re = new RegExp(`(^|[\\s,])${column}\\s*=(?!=)`, 'i');
  return sql
    .split('\n')
    .some((line) => re.test(line) && !/\bwhere\b/i.test(line) && !/is distinct from/i.test(line));
}

const renameSrc = readFileSync(RENAME, 'utf8');
const renameSql = statementsOf(RENAME);
const consolidateSrc = readFileSync(CONSOLIDATE, 'utf8');
const consolidateSql = statementsOf(CONSOLIDATE);

/**
 * The renames, as applied. Kept here rather than derived so that a change to the
 * migration shows up as a test diff a reviewer has to read.
 *
 * Arm (a) is a BRAND CLAIM: the row named the wrong entity and the listings'
 * own title prefix proves exactly one brand behind it. Arm (b) only removes a
 * legal suffix or store chrome from a name that was already the brand, so it
 * makes no claim and a second title prefix under the row is irrelevant. The two
 * are listed separately because merging them is how a later pass takes (b)'s
 * licence and applies it to a row that needs (a)'s evidence.
 */
const ARM_A: Array<[string, string]> = [
  ['Esterel Production', 'Ruf'],
  ['HK Nalone Electronic Technology Co., Ltd.', 'Nalone'],
  ['J.K. Ansell Ltd.', 'Kamasutra'],
  ['Playful Toys, Inc.', 'B Swish'],
  ['Blanche Industries GmbH', 'FRÖHLE'],
  ['BIORIUS', 'Shunga Erotic Art'],
  ['Advena Ltd.', 'Pasante'],
  ['Shenzhen J&L Technology Co., Ltd.', 'Pretty Love'],
  ['Euroscents', 'Tentacion'],
  ['SARL Rolling Skulls', 'CUT4MEN'],
  ['Scala 2.0 B.V.', 'Toyjoy'],
  ['MAPA GmbH', 'Billy Boy'],
  ['Finaflex', 'Stimul8'],
  ['THEMIS ARUnterstützung UG', 'Lovense'],
  ['Ohdoki AS', 'The Handy'],
  ['Alura Group BV', 'Autoblow'],
  ['CSSL Office 2', 'Bathmate'],
  ['Danatoys Aps', 'Dansex'],
  ['M.P.I. Pharmaceutica GmbH', 'Masculan'],
  ['Wonderboys', 'Cloneboy'],
  ['1979 SAS (Teil der Marc Dorcel Group)', 'DORCEL'],
  ['LoveBusiness B.V.', 'BodyGliss'],
  ['KESSEL medintim GmbH', 'Medintim'],
];

const ARM_B: Array<[string, string]> = [
  ['Crazy Bull Hair Products Ltd', 'Crazy Bull'],
  ['Kiiroo B.V.', 'Kiiroo'],
  ['Svakom Europe BV', 'SVAKOM'],
  ['Orgie Company / Beautyenigma LDA', 'Orgie'],
  ['INTT Cosmetics / INTTW Euro Cosmetics LDA', 'INTT'],
  ['The Swede Company AB', 'Swede'],
  ['pjur group Luxembourg S.A', 'pjur'],
  ['Mystim GmbH', 'Mystim'],
  ['Secret Play S.L', 'Secret Play'],
  ['Private Media Group, Inc.', 'Private'],
  ['XPOWER Manufacture Inc.', 'XPOWER'],
  ['chilirose Wholesale', 'Chilirose'],
  ['Creative Conceptions Kft.', 'Creative Conceptions'],
  ['SHOTS BV', 'Shots'],
  ['Control Feel S.r.l.', 'Control'],
  ['FAIR SQUARED GmbH', 'Fair Squared'],
  ['Andromedical, S.L.', 'Andromedical'],
  ['Kheper Games Inc.', 'Kheper Games'],
  ['LifeStyles Healthcare Pte. Ltd.', 'LifeStyles'],
  ['WUG Functional Gums SL', 'WUG'],
  ['Spartacus Enterprises', 'Spartacus'],
  ['Hidden Desires Limited', 'Hidden Desires'],
  ['Salzgeber & Co. Medien GmbH', 'Salzgeber'],
  ['SUPER GAY UNDERWEAR | Official Online Store', 'Super Gay Underwear'],
  ['LA MAISON KOMANDŌ | LMK', 'LA MAISON KOMANDŌ'],
  ['Magnetic Poetry INC', 'Magnetic Poetry'],
];

/**
 * Rows the machine surfaced and a human REJECTED, one per reason for rejecting.
 * If any of these ever appears as a rename the reviewed scope has been widened
 * without a reviewer, which is the failure the controls exist to catch.
 */
const STRUCK = [
  'Spectrum Boutique', // multi-brand retailer; nothing real to rename to
  'Mein Shop', // placeholder, no recoverable brand
  'Atixo GmbH', // 2 real brands (Grey Velvet 33 / Saresia 7)
  'Lubry GmbH', // 9 real brands
  'CNEX AIE, S.L', // 3 real brands
  'Vinergy GmbH', // 2 real brands (Mister Size 18 / Secura 6)
  'O-PRODUCTS B.V.', // 2 real brands (KIOTOS 14 / PIXEY 8)
  'AMOR Gummiwaren GmbH', // 6 real brands
  'Guangdong Xise Industrial Company Ltd', // 2 real brands (Xise 2 / Shequ 1)
  'W. W. Norton & Company', // "Company" is part of the real name
  'Westridge Laboratories Inc', // brand really is "ID"; under-reach on purpose
  'Rebelz Games', // title prefix "JOKE ITEMS" is a category
  'Jens Bruggemann Werbefotogafie', // title prefix "Sonstige" = German "Other"
  'Kweer Cards / Peachy Kings', // two real brands joined by a slash
  'Darkness Sensations', // arguably a sub-line, not provably wrong
];

describe('the migration files exist under their APPLIED versions', () => {
  /**
   * Both were applied live via MCP `apply_migration`, which stamps the version
   * from its own call timestamp and ignores the name passed to it. The file must
   * carry the APPLIED version or `db push` re-runs it and
   * `check-migration-drift.mjs` reports a remote version with no repo file.
   */
  it('is named for the version prod recorded', () => {
    const names = readdirSync(MIGRATIONS);
    expect(names).toContain('20260919193550_marketplace_brand_names_are_legal_entities.sql');
    expect(names).toContain('20260919194058_marketplace_brand_dup_consolidate.sql');
  });

  it('says out loud that the filename and the internal stamp disagree', () => {
    // The reviewer_note stamp is the authored version, already written into 49
    // prod rows. A future editor "fixing" one to match the other breaks either
    // the row count or the file<->history match, so the file has to warn.
    expect(renameSrc).toMatch(/FILENAME AND THE INTERNAL STAMP DELIBERATELY DISAGREE/);
    expect(renameSql).toContain('auto-rename 99991789846273');
  });
});

describe('migration 1 renames display_name and moves no identity', () => {
  it('carries all 49 renames, with the two arms kept apart', () => {
    expect(ARM_A.length + ARM_B.length).toBe(49);
    for (const [oldName, newName] of [...ARM_A, ...ARM_B]) {
      // Both sides on one line is what a `values` row looks like; asserting them
      // separately would pass against a file that paired them up differently.
      const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const row = new RegExp(`'${escaped}'\\s*,\\s*'${newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
      expect(renameSql, `${oldName} -> ${newName}`).toMatch(row);
    }
  });

  it('labels each rename with its arm, so arm b licence cannot leak into arm a', () => {
    for (const [oldName] of ARM_A) {
      const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(renameSql, `${oldName} must be arm a`).toMatch(new RegExp(`'${escaped}'[^\\n]*'a'\\)`));
    }
    for (const [oldName] of ARM_B) {
      const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(renameSql, `${oldName} must be arm b`).toMatch(new RegExp(`'${escaped}'[^\\n]*'b'\\)`));
    }
  });

  it('writes display_name and NEVER brand_key, slug, or listings.brand', () => {
    // This is the entire safety argument for the chosen shape: no URL moves.
    expect(renameSql).toMatch(/update marketplace_brands b\s*\nset display_name = r\.new_name/);
    expect(assignsColumn(renameSql, 'brand_key'), 'migration 1 must not assign brand_key').toBe(
      false,
    );
    expect(assignsColumn(renameSql, 'slug'), 'migration 1 must not assign slug').toBe(false);
    expect(renameSql).not.toMatch(/update\s+marketplace_listings/);
    // Positive control for assignsColumn: it must SEE the assignment this file
    // does make, or "does not assign brand_key" is satisfied by a broken helper.
    expect(assignsColumn(renameSql, 'display_name')).toBe(true);
  });

  it('guards the rename on the CURRENT display_name, so it is idempotent', () => {
    expect(renameSql).toMatch(/where b\.display_name = r\.old_name/);
  });

  it('preserves the prior name for reversibility', () => {
    expect(renameSql).toMatch(/prior display_name=/);
    // Appended, not overwritten: 11 of the 49 already carried a note.
    expect(renameSql).toMatch(/coalesce\(b\.reviewer_note \|\| ' \| ', ''\)/);
  });

  it('asserts the reached state positively, not the absence of a bad state', () => {
    // `if v_bad <> 0` over rows in a BAD state returns 0 for a row that has gone
    // missing entirely; counting the rows that REACHED the new name cannot.
    expect(renameSql).toMatch(/if v_reached <> 49 then/);
    expect(renameSql).toMatch(/r\.new_name = b\.display_name/);
  });

  it('asserts no slug, brand_key or status moved, against a pre-change snapshot', () => {
    expect(renameSql).toMatch(/create temp table _brand_before/);
    expect(renameSql).toMatch(/b\.slug is distinct from o\.slug/);
    expect(renameSql).toMatch(/b\.brand_key is distinct from o\.brand_key/);
    expect(renameSql).toMatch(/if v_moved <> 0 then/);
  });

  it('asserts no listing was re-attributed', () => {
    expect(renameSql).toMatch(/create temp table _listings_before/);
    expect(renameSql).toMatch(/if v_listing <> 0 then/);
  });

  it('keeps every hand-struck row out of the rename, and asserts it', () => {
    for (const name of STRUCK) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Never a rename source...
      expect(renameSql, `${name} must not be renamed`).not.toMatch(
        new RegExp(`\\('${escaped}'\\s*,\\s*'[^']+'\\s*,\\s*'[ab]'\\)`),
      );
    }
    // ...and the load-bearing subset is asserted as a control inside the file, so
    // a widened sweep fails at apply time and not only in review.
    for (const name of [
      'Spectrum Boutique',
      'Mein Shop',
      'Atixo GmbH',
      'Lubry GmbH',
      'W. W. Norton & Company',
      'Westridge Laboratories Inc',
      'Rebelz Games',
      'Jens Bruggemann Werbefotogafie',
      'Kweer Cards / Peachy Kings',
      'Darkness Sensations',
    ]) {
      expect(renameSql, `${name} must be a control`).toContain(`('${name}')`);
    }
    expect(renameSql).toMatch(/if v_ctrl <> 0 then/);
  });

  it('changes no producer, and records why', () => {
    // A blanket "strip legal suffixes" rule would corrupt W. W. Norton & Company,
    // Love Inc and Plesur Company, whose suffixes are part of the real name. The
    // rename is durable without one because register_brands() freezes
    // display_name on a non-pending row.
    expect(renameSrc).toMatch(/No change is made to `brandFromVendor\(\)`/);
    expect(renameSrc).toMatch(/only `WHEN status = 'pending'`/);
  });
});

describe('migration 2 consolidates the duplicate titles the rename created', () => {
  it('carries all 9 pairs', () => {
    const pairs: Array<[string, string]> = [
      ['cssl office 2', 'Bathmate'],
      ['creative conceptions kft.', 'Creative Conceptions'],
      ['kheper games inc.', 'Kheper Games'],
      ['kiiroo b.v.', 'Kiiroo'],
      ['themis arunterstützung ug', 'Lovense'],
      ['shenzhen j&l technology co., ltd.', 'Pretty Love'],
      ['secret play s.l', 'Secret Play'],
      ['shots bv', 'Shots'],
      ['super gay underwear | official online store', 'Super Gay Underwear'],
    ];
    expect(pairs.length).toBe(9);
    for (const [artifact, canonical] of pairs) {
      const escaped = artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(consolidateSql, `${artifact} -> ${canonical}`).toMatch(
        new RegExp(`'${escaped}'\\s*,\\s*'${canonical}'`),
      );
    }
  });

  it('requires each canonical target to be an approved, slugged row ALREADY', () => {
    // This precondition is the only reason a re-key is safe here. Without it,
    // copying this file for a pair whose target does not exist silently deletes a
    // maker page, because register_brands() mints new rows as `pending` and the
    // sitemap is approved-only.
    expect(consolidateSql).toMatch(/and b\.status='approved' and b\.slug is not null\);/);
    expect(consolidateSql).toMatch(/canonical target\(s\) are not an approved, slugged row/);
  });

  it('writes brand and not brand_key, which is GENERATED', () => {
    expect(consolidateSql).toMatch(/update marketplace_listings l set brand = c\.canonical_name/);
    expect(assignsColumn(consolidateSql, 'brand_key'), 'brand_key is GENERATED').toBe(false);
    expect(assignsColumn(consolidateSql, 'brand')).toBe(true); // control for the helper
  });

  it('NULLs the retired slug as well as rejecting the row', () => {
    // get_marketplace_brand() has no status filter, so rejecting alone leaves the
    // artifact page live over an empty product grid.
    expect(consolidateSql).toMatch(/set status='rejected', product_count=0, slug=NULL/);
  });

  it('asserts both halves of "no listing was lost"', () => {
    // "0 listings on the artifact key" alone also passes if they were deleted.
    expect(consolidateSql).toMatch(/if v_lost <> 0 then/);
    expect(consolidateSql).toMatch(/if v_live <> 0 then/);
    expect(consolidateSql).toMatch(/o\.artifact_listings \+ o\.canonical_listings/);
  });

  it('asserts the surviving URL did not move', () => {
    expect(consolidateSql).toMatch(/b\.slug is distinct from o\.canonical_slug/);
    expect(consolidateSql).toMatch(/if v_slug <> 0 then/);
  });

  it('excludes only the two PRE-EXISTING duplicate pairs, by name', () => {
    expect(consolidateSql).toMatch(/not in \('Fort Troff','MR\. Riegillio'\)/);
    // And says why, so the exclusion reads as a decision rather than a blind spot.
    expect(consolidateSrc).toMatch(/were duplicated BEFORE either\n-- migration/);
  });

  it('stamps a stable string rather than a version number', () => {
    // A renumber must not be able to desynchronise the prod rows from the guard.
    expect(consolidateSql).toContain('auto-consolidate brand-dup');
    expect(consolidateSql).not.toMatch(/auto-consolidate 2026\d{10}/);
  });
});

/**
 * The rename split 6 more brands in two, and migration 2's duplicate check was
 * structurally unable to see them. Two follow-ups closed that:
 *
 *   20260920083621 — 8 pairs that `marketplace_normalize_brand(display_name)`
 *                    detects (6 differ only in CASE, which `group by
 *                    display_name` cannot see because `=` is case-sensitive).
 *   20260920084019 — 5 more that it CANNOT detect, because it lowercases but
 *                    does not strip punctuation while `marketplace_brand_slug()`
 *                    does. The identity function for this table is the SLUG BASE.
 *
 * These assertions exist because each is a decision a later editor could undo
 * without noticing: the identity function used to detect a duplicate, the
 * direction of the merge when the clean slug sits on the row being retired, and
 * — the one with real-world stakes — that a `queer_owned` marker and a
 * hand-written story are carried off a row before it is retired.
 */
const CANON = join(MIGRATIONS, '20260920083621_marketplace_brand_canonical_key_merge.sql');
const SLUGBASE = join(MIGRATIONS, '20260920084019_marketplace_brand_slug_base_merge.sql');
const canonSql = statementsOf(CANON);
const baseSrc = readFileSync(SLUGBASE, 'utf8');
const baseSql = statementsOf(SLUGBASE);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('the canonical-key merge (20260920083621)', () => {
  const PAIRS: Array<[string, string, string]> = [
    ['autoblow', 'alura group bv', 'Autoblow'],
    ['crazy bull', 'crazy bull hair products ltd', 'Crazy Bull'],
    ['dorcel', '1979 sas (teil der marc dorcel group)', 'DORCEL'],
    ['pasante', 'advena ltd.', 'Pasante'],
    ['pjur', 'pjur group luxembourg s.a', 'pjur'],
    ['svakom', 'svakom europe bv', 'SVAKOM'],
    ['fort troff', 'forttroff', 'Fort Troff'],
    ['mr. riegillio', 'mr riegillio', 'MR. Riegillio'],
  ];

  it('carries all 8 pairs with their survivor, loser and final name', () => {
    expect(PAIRS.length).toBe(8);
    for (const [survivor, loser, name] of PAIRS) {
      expect(canonSql, `${loser} -> ${survivor}`).toMatch(
        new RegExp(`'${esc(survivor)}'\\s*,\\s*'${esc(loser)}'\\s*,\\s*'${esc(name)}'`),
      );
    }
  });

  it('detects duplicates with the IDENTITY FUNCTION, never with string equality', () => {
    // This is the whole lesson. `group by display_name having count(*)>1` is
    // case-sensitive and missed 6 of these 8.
    expect(canonSql).toMatch(/marketplace_normalize_brand\(display_name\)/);
    expect(canonSql).toMatch(/group by 1 having count\(\*\)>1/);
    expect(canonSql).not.toMatch(/group by display_name having/);
  });

  it('CARRIES the queer_owned marker and the story off the retiring row', () => {
    // Both Shape-B losers are the editorially rich rows. Retiring them without
    // this deletes a queer-owned marker from two real brands.
    expect(canonSql).toMatch(
      /ownership_tags = case when coalesce\(array_length\(s\.ownership_tags,1\),0\)=0/,
    );
    expect(canonSql).toMatch(/story\s*=\s*coalesce\(s\.story, l\.story\)/);
    // COALESCE direction matters: fill only where the survivor is empty.
    expect(canonSql).not.toMatch(/story\s*=\s*coalesce\(l\.story, s\.story\)/);
    // and it is asserted BY NAME, because "the merge completed" is equally true
    // of a merge that dropped them.
    expect(canonSql).toMatch(/'queer_owned' = any\(ownership_tags\) and story is not null/);
    expect(canonSql).toMatch(/raise exception 'canon-merge: queer_owned/);
  });

  it('frees the clean slug BEFORE claiming it', () => {
    // The unique index covers every non-null slug, so claiming before freeing
    // would abort. Step 3 (slug=NULL on the loser) must precede step 4.
    const retire = canonSql.indexOf("set status='rejected', product_count=0, slug=NULL");
    const claim = canonSql.indexOf('set slug = c.claim_slug');
    expect(retire).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(-1);
    expect(retire, 'the loser must be un-slugged before the survivor claims it').toBeLessThan(claim);
  });

  it('checks its own premise: the survivor is already approved AND canonical', () => {
    expect(canonSql).toMatch(/b\.brand_key = marketplace_normalize_brand\(c\.final_name\)/);
    expect(canonSql).toMatch(/not an approved slugged canonical row/);
    // a claimed slug must be held by its OWN loser, not merely by somebody
    expect(canonSql).toMatch(/b\.slug=c\.claim_slug and b\.brand_key=c\.loser_key/);
  });

  it('asserts the clean URLs stay live and the survivors are self-consistent', () => {
    expect(canonSql).toMatch(/only % of 8 clean slugs are live/);
    expect(canonSql).toMatch(/b\.slug is distinct from marketplace_brand_slug\(b\.brand_key\)/);
  });

  it('stamps a version-free string', () => {
    expect(canonSql).toContain('auto-merge brand-canon');
    expect(canonSql).not.toMatch(/auto-merge 2026\d{10}/);
  });
});

describe('the slug-base merge (20260920084019)', () => {
  it('carries all 5 pairs', () => {
    for (const [survivor, loser] of [
      ['b-vibe', 'b vibe'],
      ['mr s leather', 'mr-s-leather'],
      ['ouch', 'ouch!'],
      ['rocks-off', 'rocks off'],
      ['strap-on-me', 'strap on me'],
    ]) {
      expect(baseSql, `${loser} -> ${survivor}`).toMatch(
        new RegExp(`'${esc(survivor)}'\\s*,\\s*'${esc(loser)}'`),
      );
    }
  });

  it('uses the SLUG BASE as the identity function, not normalize_brand', () => {
    // normalize_brand lowercases but does not strip punctuation, so it is blind
    // to `b-vibe` vs `b vibe`. Grouping on marketplace_brand_slug(brand_key) is
    // what found these five.
    expect(baseSql).toMatch(/select marketplace_brand_slug\(brand_key\) cs from marketplace_brands/);
    expect(baseSql).toMatch(/slug-base split\(s\) remain/);
  });

  it('ALSO asserts the weaker test, so it cannot regress its predecessor', () => {
    expect(baseSql).toMatch(/normalise-split\(s\) remain/);
    expect(baseSql).toMatch(/marketplace_normalize_brand\(display_name\)/);
  });

  it('asserts the pair really is one brand before merging it', () => {
    expect(baseSql).toMatch(
      /marketplace_brand_slug\(c\.survivor_key\) is distinct from marketplace_brand_slug\(c\.loser_key\)/,
    );
    expect(baseSql).toMatch(/do not share a slug base/);
  });

  it('changes no display_name, and records why', () => {
    // Title-prefix corroboration exists for only 2 of the 5; `Ouch!` and
    // `Mr. S. Leather` are very likely right and are NOT corroborated, so they
    // are left for a human. Under-reaching is the correct error.
    expect(baseSrc).toMatch(/NO display_name is changed, and that is deliberate/);
    expect(baseSrc).toMatch(/Under-reaching is the correct error/);
    // every final_name must be a name that already sat on the surviving row,
    // i.e. the file invents nothing
    for (const name of ['b-Vibe', 'MR S LEATHER', 'OUCH', 'Rocks-Off', 'Strap-On-Me']) {
      expect(baseSql).toContain(`'${name}'`);
    }
  });

  it('records that the uniquifier-suffix regex was measured and REJECTED', () => {
    // `-[0-9a-f]{4}$` also matches `vaux-by-cb13`, where cb13 is CellBlock 13 —
    // part of the brand's real name — and it misses `rocks-off-2` entirely.
    expect(baseSrc).toMatch(/vaux-by-cb13/);
    expect(baseSrc).toMatch(/REJECTED, measured/);
    expect(baseSrc).toMatch(/NUMERIC/);
  });

  it('releases the uniquifier slugs and keeps the clean ones live', () => {
    expect(baseSql).toMatch(/only % of 5 clean slugs live/);
    expect(baseSql).toMatch(/uniquifier slug\(s\) still held/);
  });
});
