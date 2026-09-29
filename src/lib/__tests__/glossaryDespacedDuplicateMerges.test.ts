/**
 * Guards 99991790721199_glossary_despaced_duplicate_merges.sql.
 *
 * Seven concepts each held two rows, spelled with and without a hyphen — the residue
 * of the sweep that produced the water-sports split and the teddybear repair. Unlike
 * teddybear these are DUPLICATES, not wrong senses.
 *
 * The direction rule is the substance: the survivor is whichever row best represents
 * the concept, and the publication lane follows from `enforce_tag_publication_role`.
 * That means three concepts (darkroom, gun-play, boytoy) end as `utility` with no
 * indexed page, because keeping the indexed stub instead would have merged a 2,577-
 * character body into a 46-character one — `merge_tag_concept` does not move prose.
 *
 * Assertions run over COMMENT-STRIPPED SQL. The header quotes both slugs of every
 * pair, the trigger name and the rejected alternative verbatim, so an unstripped
 * `toContain` is satisfied by the explanation while the statement is missing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991790721199_glossary_despaced_duplicate_merges';
const DIR = join(process.cwd(), 'supabase/migrations');

const raw = (() => {
  const f = readdirSync(DIR).find((x) => x.startsWith(MIGRATION));
  if (!f) throw new Error(`migration ${MIGRATION} not found in ${DIR}`);
  return readFileSync(join(DIR, f), 'utf8');
})();

/** Line-start comments only — a mid-line `--` may sit inside a literal. */
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const work = sql.slice(0, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

/** Comments with the `--` STRIPPED before joining. Filtering without stripping leaves
 *  the marker mid-string, so a sentence wrapping across two lines becomes
 *  "... NO -- DEFAULT" and every pattern spanning the break silently fails. */
const prose = raw
  .split('\n')
  .filter((l) => /^\s*--/.test(l))
  .map((l) => l.replace(/^\s*--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

/** keeper -> loser, the direction this file commits to. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['water-sports', 'watersports'],
  ['cross-dresser', 'crossdresser'],
  ['bicurious', 'bi-curious'],
  ['face-fucking', 'facefucking'],
  ['darkroom', 'dark-room'],
  ['gun-play', 'gunplay'],
  ['boytoy', 'boy-toy'],
];

describe('the seven merges and their direction', () => {
  it('names every pair keeper-first, in the work block', () => {
    for (const [keep, drop] of PAIRS) {
      expect(work).toContain(`'${keep}'`);
      expect(work).toContain(`'${drop}'`);
      // The VALUES list is (keeper, loser); a reversed row would merge the content away.
      expect(work).toMatch(new RegExp(`'${keep}'\\s*,\\s*'${drop}'`));
    }
  });

  it('merges keeper <- loser, never the reverse', () => {
    expect(work).toMatch(/merge_tag_concept\(\s*\n?\s*v_keep, v_drop/);
    expect(work).not.toMatch(/merge_tag_concept\(\s*\n?\s*v_drop, v_keep/);
  });

  it('is soft on preconditions so a concurrent merge cannot abort main', () => {
    expect(work).toMatch(/if v_keep is null or v_drop is null then/);
    expect(work).toMatch(/continue;/);
    expect(work).not.toMatch(/if v_keep is null[\s\S]{0,140}raise exception/);
  });

  it('declares an attributed actor — three losers are human_reviewed', () => {
    expect(work).toMatch(/set_config\('app\.actor'/);
    expect(work).toContain(MIGRATION);
  });
});

describe('the 23505 category trap', () => {
  it('demotes the loser primary BEFORE the merge', () => {
    const demote = work.search(/set is_primary = false/);
    const merge = work.search(/merge_tag_concept/);
    expect(demote).toBeGreaterThan(-1);
    expect(demote).toBeLessThan(merge);
  });

  it('deletes only the LOSER own inherited category, not every extra membership', () => {
    // Scoped to v_dropcat. A blanket "anything that is not the keeper's" would strip a
    // keeper's legitimate second membership.
    expect(work).toMatch(/category_id = v_dropcat/);
    expect(work).not.toMatch(/category_id is distinct from v_keepcat\s*;/);
    expect(work).toMatch(/v_dropcat is not null and v_dropcat is distinct from v_keepcat/);
  });
});

describe('what the merge moves, and what it does not', () => {
  it('moves the seven bi-curious translations by hand', () => {
    // Probed: the merge leaves the loser's aliases stranded on the merged row.
    expect(work).toMatch(/update public\.tag_aliases/);
    for (const a of [
      'bicurieux',
      'bicuriosa',
      'bicuriose',
      'bicuriosidad',
      'bicuriosit',
      'bicurioso',
      'htro-curieux',
    ])
      expect(work).toContain(`'${a}'`);
    expect(work).not.toMatch(/delete from public\.tag_aliases/);
  });

  it('records that relations move by TRIGGER, not by the merge function', () => {
    expect(prose).toMatch(/trg_unified_tags_repoint_relations/);
    expect(prose).toMatch(/merge_tag_repoint_relations/);
    // And the substring trap that hides it from a catalogue grep.
    expect(prose).toMatch(/not a contiguous substring/);
  });

  it('tombstones the inherited coitus edge rather than deleting or moving it', () => {
    expect(work).toMatch(/review_status = 'rejected'/);
    expect(work).toContain("'coitus'");
    // A delete would also stop it displaying, but frees the pair to be re-proposed.
    expect(work).not.toMatch(/delete from public\.tag_relations/);
    // And it must not hand-move the oral-sex edge — the trigger already did.
    expect(work).not.toMatch(/set source_tag_id =/);
  });

  it('aliases the relations table as tr, not r', () => {
    // The loop variable is a plpgsql RECORD named `r`; a table aliased `r` makes
    // `r.source_tag_id` resolve to the record — "record r has no field source_tag_id".
    expect(work).toMatch(/update public\.tag_relations tr/);
    expect(work).not.toMatch(/update public\.tag_relations r\b/);
  });
});

describe('postconditions assert the reached state', () => {
  it('proves each pair merged in the INTENDED direction, as pairs not counts', () => {
    // A count of 7 merged rows is equally satisfied by seven backwards merges.
    expect(verify).toMatch(/k\.id\s*=\s*d\.merged_into_id/);
    expect(verify).toMatch(/k\.slug\s*=\s*t\.keep_slug/);
    expect(verify).toMatch(/if v_bad <> 7 then/);
  });

  it('proves the CONTENT survived on the three substance keepers', () => {
    // This is the half the tempting direction would have destroyed.
    expect(verify).toMatch(/slug\s*=\s*'darkroom'[\s\S]{0,80}> 2000/);
    expect(verify).toMatch(/slug\s*=\s*'gun-play'[\s\S]{0,80}> 400/);
    expect(verify).toMatch(/slug\s*=\s*'boytoy'[\s\S]{0,80}> 400/);
  });

  it('proves the assignments moved, by count', () => {
    expect(verify).toMatch(/darkroom[\s\S]{0,200}176/);
    expect(verify).toMatch(/water-sports[\s\S]{0,200}15/);
  });

  it('asserts one primary category per keeper AND that each has one', () => {
    // The having-clause check is silent for a keeper with ZERO primary rows, because
    // the group disappears; the distinct-count mirror is what covers that.
    expect(verify).toMatch(/having count\(\*\) <> 1/);
    expect(verify).toMatch(/count\(distinct t\.slug\)/);
    expect(verify).toMatch(/only % of 7 keepers have a primary category/);
  });

  it('asserts the coitus edge EXISTS and is rejected, not merely absent', () => {
    expect(verify).toMatch(/t\.slug = 'coitus'[\s\S]{0,140}review_status = 'rejected'/);
    expect(verify).toMatch(/not tombstoned/);
    // ...and separately that nothing displaying survives.
    expect(verify).toMatch(/still displays/);
  });

  it('carries neighbouring controls so a corpus-wide sweep cannot pass', () => {
    for (const s of ['bear', 'teddy-bear', 'plushophilia', 'aquatic-sports', 'oral-sex'])
      expect(verify).toContain(`'${s}'`);
    expect(verify).toMatch(/if v_bad <> 9 then/);
  });

  it('cannot be neutered by a loosened comparison or a pre-seeded counter', () => {
    expect(verify).not.toMatch(/if v_\w+ < 0 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
  });
});

describe('the decisions are recorded, not just executed', () => {
  it('states the cost: three concepts lose their indexed page', () => {
    expect(prose).toMatch(/NO INDEXED PAGE/);
    expect(prose).toMatch(/darkroom.*gun-play.*boytoy|gun-play.*boytoy/);
  });

  it('refuses to fake the review flag that would force them into the article lane', () => {
    expect(prose).toMatch(/prose_reviewed_at/);
    expect(prose).toMatch(/1,116 distinct timestamps/);
    expect(prose).toMatch(/assert a review that did not happen/);
  });

  it('justifies the coitus tombstone from the rows, not from taste', () => {
    expect(prose).toMatch(/Q2122/);
    expect(prose).toMatch(/Q5873/);
    expect(prose).toMatch(/NO description and NO category/);
  });

  it('names what it deliberately did not do', () => {
    expect(prose).toMatch(/Q21862836/);
    expect(prose).toMatch(/No QID|no QID/);
  });
});
