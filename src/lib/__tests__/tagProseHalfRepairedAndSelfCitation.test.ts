import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards `63000101171500`, round eight of the disowned-prose backlog.
 *
 * The assertions are the places an 18-row batch can do harm:
 *
 *   1. `description` is never written — it is the evidence every repair rests on.
 *   2. Every UPDATE is content-guarded on the defect's own text, so a concurrent
 *      session that fixes a row first is not overwritten.
 *   3. Group A is SUMMARY ONLY. Those five rows were chosen precisely because
 *      their body is already correct; a mutation that also rewrites the body
 *      would destroy the evidence that justified the repair.
 *   4. Group C removes a sentence with `replace()` and NEVER writes a new body
 *      literal — that is what makes "every other sentence survives byte-identical"
 *      true by construction rather than by my having retyped it correctly.
 *   5. Postconditions test for the WRONG text, never for this file's own wording
 *      (20360401100100: an exact-match assertion RAISEs on someone else's better
 *      fix and aborts `db push` on main for every migration queued behind it).
 */

const FILE = join(
  process.cwd(),
  'supabase/migrations/63000101171500_tag_prose_half_repaired_and_self_citation.sql',
);

const sql = readFileSync(FILE, 'utf8');

/** Statements only — a claim made in a comment is not a guard. */
function statements(): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

/** The UPDATE statements, split so an assertion can be scoped to one. */
function updates(): string[] {
  return statements()
    .split(/update\s+unified_tags/i)
    .slice(1)
    .map((u) => u.slice(0, u.indexOf(';')));
}

function updateFor(slug: string): string {
  const u = updates().find((x) => x.includes(`slug = '${slug}'`));
  expect(u, `no UPDATE for ${slug}`).toBeDefined();
  return u as string;
}

/**
 * The postcondition block ONLY.
 *
 * Load-bearing: every defect string appears TWICE — once in an UPDATE's content
 * guard and once in the postcondition — so an assertion over the whole file
 * matches the guard and passes even when the postcondition has been gutted.
 * Mutation testing caught exactly that on round seven.
 */
function verifyBlock(): string {
  const i = statements().indexOf('do $verify$');
  expect(i).toBeGreaterThan(-1);
  return statements().slice(i, statements().indexOf('do $defer$'));
}

const GROUP_A = ['face-fucking', 'breeding', 'oral', 'masturbating', 'pretzel'];
const GROUP_C = [
  'anal-warts',
  'condomless',
  'drug-substitution-therapy',
  'hormone-blockers',
  'sexual-health-screening',
  'social-transition',
];

describe('half-repaired rows and self-citation migration', () => {
  const code = statements();

  it('declares an actor, which the audit trigger requires', () => {
    // 14 of 18 rows are human_reviewed, and log_unified_tag_change() RAISEs when a
    // `system:%` actor modifies one.
    expect(code).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'migration:63000101171500'/);
  });

  it('never writes description', () => {
    const us = updates();
    expect(us.length).toBe(18);
    for (const u of us) {
      const setClause = u.slice(0, u.search(/\bwhere\b/i));
      // `short_description` / `long_description` must not satisfy this.
      expect(setClause).not.toMatch(/(^|[\s,])description\s*=/);
      expect(setClause).toMatch(/(short_description|long_description)\s*=/);
    }
  });

  it('guards every repair on the defect’s own text', () => {
    for (const u of updates()) {
      const where = u.slice(u.search(/\bwhere\b/i));
      expect(where).toMatch(/and\s+(short_description|long_description)\s*(=|like)/);
    }
  });

  it('leaves the already-correct body alone on every Group A row', () => {
    // These five were selected BECAUSE the body is right and the lead line is not.
    // Touching the body would destroy the evidence the repair rests on.
    for (const slug of GROUP_A) {
      const u = updateFor(slug);
      expect(u, slug).toMatch(/short_description\s*=/);
      expect(u, slug).not.toMatch(/long_description/);
    }
  });

  it('nulls a body only where the description is too thin to author one from', () => {
    for (const slug of ['feeder', 'power-bottom', 'hedonist']) {
      expect(updateFor(slug), slug).toMatch(/long_description\s*=\s*null/);
    }
    // impact-model, vetted and ducky already have a null body, so writing
    // `long_description = null` there would be a write that changes nothing while
    // looking like a repair. pelvic-floor-health's body is generic but not wrong.
    for (const slug of ['impact-model', 'vetted', 'ducky', 'pelvic-floor-health']) {
      expect(updateFor(slug), slug).not.toMatch(/long_description/);
    }
  });

  it('removes the citation by replace(), never by writing a new body', () => {
    // This is what makes "every other sentence survives byte-identical" structural.
    // A literal replacement body could silently rewrite the surrounding prose — the
    // bulk-rewrite this repo retired after the judge got 13 of 16 retractions wrong.
    for (const slug of GROUP_C) {
      const u = updateFor(slug);
      expect(u, slug).toMatch(/long_description\s*=\s*replace\(\s*long_description\s*,/);
      expect(u, slug).toMatch(/,\s*''\s*\)/);
      expect(u, slug).not.toMatch(/short_description/);
    }
  });

  it('keeps the space that makes each citation removal leave clean prose', () => {
    // Four sit mid-body and must consume the TRAILING space; two are final and must
    // consume the LEADING one. Getting this wrong leaves a double space or a space
    // before the full stop, which no count-based check would ever notice.
    for (const slug of [
      'anal-warts',
      'condomless',
      'drug-substitution-therapy',
      'hormone-blockers',
    ]) {
      expect(updateFor(slug), slug).toMatch(/options\. '|infections\. '|addiction\. '|youth\. '/);
    }
    for (const slug of ['sexual-health-screening', 'social-transition']) {
      expect(updateFor(slug), slug).toMatch(/'\s?According to a scientific article/);
      expect(updateFor(slug), slug).toMatch(/replace\(long_description,\n?\s*' According to/);
    }
  });

  it('tests for the WRONG text, not for its own wording', () => {
    const verify = verifyBlock();
    expect(verify).toMatch(/'Adult film production company'/);
    expect(verify).toMatch(/'Baked pastry made from dough'/);
    expect(verify).toMatch(/'Masturbation discussion'/);
    expect(verify).toMatch(/'Biological process of producing offspring'/);
    // ...and never for the replacements it happens to write.
    expect(verify).not.toMatch(/A duck persona\./);
    expect(verify).not.toMatch(/A person who pursues pleasure\./);
    expect(verify).not.toMatch(/Rough oral sex in which the penetrating partner does/);
  });

  it('drives the self-citation cohort to zero CORPUS-WIDE, not just on its own rows', () => {
    // Scoped to the postcondition: the same phrase appears in six UPDATE guards, so
    // asserting over the whole file would match those and pass with this check gone.
    const verify = verifyBlock();
    expect(verify).toMatch(
      /from unified_tags\s*\n?\s*where status = 'active' and long_description ~\* 'according to a scientific article'/,
    );
    expect(verify).toMatch(
      /raise exception '% active row\(s\) still cite their own source to the reader'/,
    );
    // No slug filter — a SEVENTH row acquiring the defect must fail here too.
    const idx = verify.indexOf("~* 'according to a scientific article'");
    expect(verify.slice(Math.max(0, idx - 260), idx)).not.toMatch(/slug/);
  });

  it('asserts the Group A bodies survived the summary-only repair', () => {
    // Without this, a mutation that empties the good body passes every other check.
    const verify = verifyBlock();
    expect(verify).toMatch(
      /slug in \('face-fucking','breeding','oral','masturbating','pretzel'\)\s*\n?\s*and coalesce\(long_description, ''\) = ''/,
    );
    expect(verify).toMatch(
      /raise exception '% half-repaired row\(s\) lost the body that established the sense'/,
    );
  });

  it('asserts Group C lost a sentence and not the body', () => {
    const verify = verifyBlock();
    expect(verify).toMatch(/length\(coalesce\(long_description, ''\)\) < 200/);
    expect(verify).toMatch(
      /raise exception '% self-citation row\(s\) lost more than the citation sentence'/,
    );
  });

  it('asserts every touched row stays above the thin-page gate', () => {
    const verify = verifyBlock();
    expect(verify).toMatch(/not tag_has_prose\(description,\s*short_description\)/);
    expect(verify).toMatch(/raise exception '% row\(s\) fell below the thin-page gate'/);
  });

  it('asserts the description it reasoned from is still present', () => {
    const verify = verifyBlock();
    expect(verify).toMatch(/and description is null/);
    expect(verify).toMatch(/lost the description this file reasoned from/);
  });

  it('still names every deliberate deferral, each with its own reason', () => {
    // Assert the CONDITIONS, not the notice MESSAGES. A mutation that neuters a
    // WHERE clause leaves the message intact, so matching the prose alone passes
    // against a report that can never fire.
    const i = statements().indexOf('do $defer$');
    expect(i).toBeGreaterThan(-1);
    const defer = statements().slice(i);
    expect(defer).toMatch(/long_description ~\* '\(it is\|it''s\) essential to'/);
    expect(defer).toMatch(
      /slug in \('triad','restraints','sexual-positions','algophilia','scat-play','solidarity'\)/,
    );
    expect(defer).toMatch(/slug in \('tea','titica','balloon'/);
    expect(defer).toMatch(
      /slug in \('partners-in-mischief','heterotypical','accipiosexual','bicon','ebony','queen'\)/,
    );
    expect(defer).toMatch(/description ilike 'Information about %'/);
    expect(defer).toMatch(/the queen rule/);
  });

  it('does not touch rows the previous tranches already repaired', () => {
    // Repairing one row twice is how db push ends up asserting a state neither
    // migration reached.
    const prior = [
      'masc',
      'girl',
      'boy',
      'cunt',
      'whore',
      'scat',
      'submission',
      'mommy',
      'toymaker',
      'pet-owner',
      'play-room',
      'rumpus-room',
      'long-hair',
      'scent',
      'rough-sex',
      'offering',
      'maid-service',
      'adventurer',
      'feedee',
      'older-women',
      'down-low',
      'alpha-pet',
    ];
    for (const slug of prior) {
      for (const u of updates()) expect(u, slug).not.toContain(`slug = '${slug}'`);
    }
  });

  it('stays composable with the concurrent session working the same seam', () => {
    // 62000201100000_tag_prose_summary_seam.sql (branch
    // claude/glossary-tag-quality-761286) repairs `masturbating` and `vetted` too,
    // with different wording. Neither branch has merged, so both files keep the
    // rows; what makes that safe is that BOTH sides guard on the same defect text,
    // so whichever applies second matches nothing and writes nothing.
    //
    // This asserts the property rather than the comment: drop either guard and the
    // second migration to land would overwrite prose the first one already fixed.
    expect(updateFor('masturbating')).toMatch(/and short_description = 'Masturbation discussion'/);
    expect(updateFor('vetted')).toMatch(/and short_description = 'Vetted'/);
    // And the postconditions must key on that same wrong text, never on the wording
    // THIS file writes — otherwise the other session's correct fix would RAISE here
    // and abort `db push` on main for every migration queued behind it.
    const verify = verifyBlock();
    expect(verify).toMatch(/'Masturbation discussion'/);
    expect(verify).toMatch(/'Vetted'/);
    expect(verify).not.toMatch(/Approved by an organiser or community/);
    expect(verify).not.toMatch(/Stimulating one''?s own genitals/);
  });

  it('repairs power-bottom, whose summary defined a DIFFERENT live tag', () => {
    const u = updateFor('power-bottom');
    // Its summary was the definition of `bottom`, which is its own row — so the
    // corpus defined bottom twice and the power-bottom page never said what the
    // word adds. The rough-sex/aids shape.
    expect(u).toMatch(/and short_description = 'A person who takes a receptive role in sex'/);
    expect(u).toMatch(/drives the pace/);
  });
});
