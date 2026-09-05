import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs operator script, no type declarations
import { REPAIRS as RAW_REPAIRS } from '../../../scripts/data-quality/kink-stamp-repair-definitions.mjs';

/**
 * The definitions module is plain `.mjs` outside `src`, so `tsconfig.app.json`
 * never sees it and the import arrives untyped. Shaped here rather than in the
 * module: it is deliberately readable by an editor who does not write
 * TypeScript.
 */
type Repair = {
  slug: string;
  name?: string;
  newSlug?: string;
  cat: string;
  desc: string;
  long: string | null;
  clearQid?: boolean;
  dropAlias?: string[];
  publish: boolean;
  note?: string;
};
const REPAIRS = RAW_REPAIRS as Repair[];

/**
 * `20270901100000` replaces the 'Toys tag' / 'Philia tag' import stamps on 61
 * kink glossary rows with hand-written definitions, re-files them, clears six
 * wrong-entity Wikidata identifiers and publishes them.
 *
 * The migration asserts its own effect against the database, so this file pins
 * only the properties whose loss would be SILENT — the ones that stay true in
 * the DB while the reason for them rots away.
 */

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20270901100000_kink_stamp_repair.sql'),
  'utf8',
);

/**
 * Executable SQL only. The header of this migration necessarily NAMES the
 * things it forbids — it explains that six rows "were is_adult=false because
 * they were misfiled" and lists the wrong QIDs verbatim — so a check run over
 * the raw file fails on its own documentation. Both assertions below did
 * exactly that on first run.
 */
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('kink stamp repair — definitions', () => {
  it('covers 61 rows with unique slugs and unique descriptions', () => {
    // A shared short description is exactly what
    // placeholder_description_active counts (1-40 chars on more than five
    // rows). Replacing 61 stamps with a handful of shared sentences would
    // recreate the defect at a smaller scale and still satisfy "no row says
    // 'Toys tag'".
    expect(REPAIRS).toHaveLength(61);
    expect(new Set(REPAIRS.map((r) => r.slug)).size).toBe(61);
    expect(new Set(REPAIRS.map((r) => r.desc.trim().toLowerCase())).size).toBe(61);
  });

  it('writes no consent boilerplate', () => {
    // TAG_STYLE_SYSTEM bans padding with consent/safety boilerplate, and ten of
    // these rows arrived carrying a variant of "As with any fetish, it's
    // essential to prioritize consent and respect in all interactions." A
    // specific safety fact (no current across the chest, sterile sounds, an
    // inflatable gag's deflate bulb) is information; a generic one is filler,
    // and it is what made this corpus read as machine-written.
    const boilerplate =
      /(essential to (prioriti[sz]e|prioritize) consent|as with any (fetish|sexual activity)|prioriti[sz]e open communication|consent (are|is) paramount|approach this topic with (respect|sensitivity))/i;
    const offenders = REPAIRS.filter(
      (r) => boilerplate.test(r.desc) || (r.long && boilerplate.test(r.long)),
    ).map((r) => r.slug);
    expect(offenders).toEqual([]);
  });

  it('keeps a body only where one already exists, and never invents an empty one', () => {
    // `long: null` means "the stored body is correct, keep it". It must never be
    // a way to leave a row with no body at all — the migration's own thin
    // assertion (>= 120 chars) is what enforces that against prod, and this
    // pins the intent so the three rows stay a deliberate list rather than a
    // growing escape hatch.
    const kept = REPAIRS.filter((r) => r.long === null).map((r) => r.slug);
    expect(kept).toEqual(['nipple-clamps', 'strap-on', 'sex-swing']);
  });
});

describe('kink stamp repair — migration', () => {
  it('re-files by writing category_id, never the category text or the junction', () => {
    // The BEFORE trigger derives unified_tags.category from category_id and the
    // AFTER trigger moves the primary junction row. Writing the text mirror or
    // inserting a junction row directly fires neither, so the other two
    // representations silently disagree forever — and /tags/:slug renders the
    // JUNCTION while the search facet renders the TEXT.
    expect(sql).toMatch(/category_id\s*=\s*v_cat/);
    expect(sql).not.toMatch(/insert into public\.tag_category_assignments/);
    expect(sql).not.toMatch(/set[^;]*\bcategory\s*=\s*'/);
  });

  it('never writes is_adult by hand', () => {
    // is_adult is derived from the junction by
    // unified_tags_recompute_is_adult(). Writing it would satisfy the
    // migration's own adult assertion while leaving the junction to recompute
    // it back — the same failure 20261230113700 was written to undo.
    expect(code).not.toMatch(/\bis_adult\s*=(?!=)/);
    expect(sql).toMatch(/came out NOT adult-gated/);
  });

  it('clears wrong identifiers and never re-resolves one', () => {
    // Prefer NULL to a guess: a plausible-but-wrong QID regenerates wrong data
    // into tag_medical_codes, broader edges and the Elsewhere rail every week,
    // a null one regenerates nothing. The only assignment to wikidata_id must
    // be the conditional clear.
    expect(code).toMatch(
      /wikidata_id\s*=\s*case when r\.clear_qid then null else t\.wikidata_id end/,
    );
    // Every assignment to the column must be the conditional clear. Matching
    // the tail rather than a negative lookahead: `\s*` is greedy-but-backtracking,
    // so `wikidata_id\s*=\s*(?!case when …)` succeeds on column-aligned SQL by
    // simply matching fewer spaces — it passed vacuously on first write.
    const assignments = code.match(/wikidata_id\s*=\s*[^\n]*/g) ?? [];
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toContain('case when r.clear_qid then null');
    expect(
      REPAIRS.filter((r) => r.clearQid)
        .map((r) => r.slug)
        .sort(),
    ).toEqual(
      ['crops', 'impact-tools', 'inflatable-ball', 'ovipositor', 'pinwheel', 'xenophilia'].sort(),
    );
  });

  it('updates one slug at a time', () => {
    // A set-based UPDATE that touches category_id raises Postgres 27000 ("tuple
    // to be updated was already modified") through the category sync trigger
    // pair. The loop is a correctness requirement, not a style choice.
    expect(sql).toMatch(/for r in select \* from _fix order by slug loop/);
    expect(sql).toMatch(/where t\.slug = r\.slug/);
  });

  it('proves the rows survived rather than only that the stamps are gone', () => {
    // "Zero rows say 'Toys tag'" also passes on a corpus where the rows were
    // deleted. The migration must additionally assert the rows are still active
    // and carry real prose — the positive control.
    expect(sql).toMatch(/stamped row\(s\) remain/);
    expect(sql).toMatch(/missing, inactive or thin after the repair/);
    expect(sql).toMatch(/description\(s\) are shared by more than one row/);
  });

  it('checks that publishing actually took', () => {
    // seo_indexable is forced false by three separate BEFORE gates
    // (sensitivity, facet, thin), so setting the column is not the same as
    // achieving it. verification_status is the lever that shows a sensitive row
    // to a signed-out reader; seo_indexable alone does not.
    expect(sql).toMatch(/did not publish/);
    expect(sql).toMatch(/verification_status <> 'reviewed'/);
  });

  it('declares an attributed actor', () => {
    // log_unified_tag_change() raises when an actor reading `system:%` modifies
    // a human_reviewed row, and 55 of these 61 already carry that flag.
    expect(sql).toMatch(/set_config\('app\.actor', 'migration:kink-stamp-repair', true\)/);
  });
});
