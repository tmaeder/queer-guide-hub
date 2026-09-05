import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs operator script, no type declarations
import * as defs from '../../../scripts/data-quality/kink-stamp-repair-2-definitions.mjs';

/**
 * `20270901110000` finishes the stamp backlog: the 49 rows carrying
 * `'Sexual activity tag'` and the 11 carrying `'Scene safety tag'`, taking
 * `placeholder_description_active` from 60 to 0.
 *
 * The migration asserts its own effect against the database, so this pins only
 * what would be lost SILENTLY — the reasoning that stays true in the DB while
 * the reason for it rots away.
 */

type Repair = {
  slug: string;
  cat: string;
  desc: string;
  long: string | null;
  clearQid?: boolean;
  publish: boolean;
  note?: string;
};
const REPAIRS = defs.REPAIRS as Repair[];
const UNGATED = defs.DELIBERATELY_UNGATED as string[];
const STAYS_ADULT = defs.STAYS_ADULT as string[];

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20270901110000_kink_stamp_repair_2.sql'),
  'utf8',
);
/** Executable SQL only — the header necessarily names what it forbids. */
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

describe('kink stamp repair 2 — definitions', () => {
  it('covers 60 rows with unique slugs and unique descriptions', () => {
    expect(REPAIRS).toHaveLength(60);
    expect(new Set(REPAIRS.map((r) => r.slug)).size).toBe(60);
    expect(new Set(REPAIRS.map((r) => r.desc.trim().toLowerCase())).size).toBe(60);
  });

  it('writes no consent boilerplate', () => {
    const boilerplate =
      /(essential to (prioriti[sz]e|prioritize) consent|as with any (fetish|sexual activity)|prioriti[sz]e open communication|consent (are|is) paramount|approach this topic with (respect|sensitivity))/i;
    expect(
      REPAIRS.filter((r) => boilerplate.test(r.desc) || (r.long && boilerplate.test(r.long))).map(
        (r) => r.slug,
      ),
    ).toEqual([]);
  });

  it('un-gates the safety PROCEDURES and keeps the D/s STATES gated', () => {
    // This is the one editorial decision in the migration, and it runs in both
    // directions. A person needs to be able to read what a safe call is BEFORE
    // they are in the room, so filing it under Consent & Negotiation — which
    // unified_tags_recompute_is_adult() deliberately excludes — un-gates it.
    // subspace / sub-frenzy / dom-frenzy stay 18+ because they are states
    // inside a D/s dynamic and un-gating them buys nothing.
    //
    // Pinned because a later re-file could quietly put a safety term back
    // behind an age wall, or drag a kink state out from behind one, and every
    // database assertion would still pass — the migration checks the flag
    // AGAINST THESE LISTS, so the lists are the thing that has to be right.
    expect(UNGATED).toEqual(
      expect.arrayContaining([
        'safe-call',
        'vetting',
        'trauma-awareness',
        'meeting-for-the-first-time',
        'after-scene-drop',
        'rope-compatibility-checks',
      ]),
    );
    expect(STAYS_ADULT).toEqual(['subspace', 'sub-frenzy', 'dom-frenzy']);
    for (const slug of STAYS_ADULT) expect(UNGATED).not.toContain(slug);
    // Every un-gated row must actually be filed somewhere non-adult, or the
    // list is a claim the junction does not support.
    for (const slug of UNGATED) {
      const r = REPAIRS.find((x) => x.slug === slug);
      expect(r, `${slug} is declared un-gated but is not in the repair set`).toBeDefined();
      expect(r!.cat, `${slug} is declared un-gated but filed under a kink stop`).toBe(
        'consent-negotiation',
      );
    }
  });

  it('states the specific risk on the practices that carry one', () => {
    // TAG_STYLE_SYSTEM bans generic consent padding, which is exactly why the
    // REAL warnings must be present: removing boilerplate is only an
    // improvement if the concrete facts survive it. Each of these was the
    // single most load-bearing sentence on its page.
    const must: Array<[string, RegExp]> = [
      ['scat-play', /hepatitis a|shigella/i],
      ['urethral-sounding', /steril/i],
      ['queening', /breath|airway/i],
      ['stretching', /tear/i],
      ['testicular-sex', /torsion/i],
      ['deepthroat', /breath/i],
    ];
    for (const [slug, re] of must) {
      const r = REPAIRS.find((x) => x.slug === slug)!;
      expect(`${r.desc} ${r.long ?? ''}`, `${slug} lost its specific risk`).toMatch(re);
    }
  });
});

describe('kink stamp repair 2 — migration', () => {
  it('asserts the age gate PER ROW, not one direction for all', () => {
    // The cohort-1 assertion was "no row came out un-gated". Reusing it here
    // would fail on the eight deliberately un-gated safety rows, and the
    // tempting fix — deleting the assertion — would remove the only check that
    // a re-file did what it meant to.
    expect(code).toMatch(/expect_adult boolean/);
    expect(code).toMatch(/is distinct from f\.expect_adult/);
    expect(sql).toMatch(/WRONG age gate/);
    expect(code).not.toMatch(/where t\.is_adult is not true;/);
  });

  it('never writes is_adult by hand and re-files by category_id only', () => {
    expect(code).not.toMatch(/\bis_adult\s*=(?!=)/);
    expect(code).toMatch(/category_id\s*=\s*v_cat/);
    expect(code).not.toMatch(/insert into public\.tag_category_assignments/);
  });

  it('clears wrong identifiers and never re-resolves one', () => {
    const assignments = code.match(/wikidata_id\s*=\s*[^\n]*/g) ?? [];
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toContain('case when r.clear_qid then null');
    expect(
      REPAIRS.filter((r) => r.clearQid)
        .map((r) => r.slug)
        .sort(),
    ).toEqual(['free-use', 'subspace', 'vetting']);
  });

  it('updates one slug at a time and proves the rows survived', () => {
    expect(code).toMatch(/for r in select \* from _fix order by slug loop/);
    expect(sql).toMatch(/stamped row\(s\) remain/);
    expect(sql).toMatch(/missing, inactive or thin after the repair/);
  });

  it('declares an attributed actor', () => {
    expect(code).toMatch(/set_config\('app\.actor', 'migration:kink-stamp-repair-2', true\)/);
  });
});
