import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991789858199 — the glossary lead-register rule and the two counters
 * added beside it.
 *
 * WHAT A LATER READER COULD UNDO WHILE EVERY OTHER CHECK STILL PASSED:
 *
 * 1. NO PROSE IS WRITTEN. Same invariant as every migration in this series. The
 *    brief asked for 3,615 descriptions to be rewritten; that is the experiment
 *    this repo ran and retired when the prose judge retracted 16 of 18 rows with
 *    13 WRONG. This file adds a rule and two counters and touches no row of
 *    unified_tags.
 *
 * 2. THE COMMONWEALTH COUNTER STAYS SCOPED TO OUR OWN VOICE. The obvious
 *    "improvement" is to drop the length bound and count all 44 British
 *    spellings. Measured, 39 of those sit in imported Wikipedia prose whose
 *    defect is the imported lead, not the spelling — so a wider gate is standing
 *    pressure to polish imported text rather than replace it.
 *
 * 3. THREE TOKENS STAY EXCLUDED, AND EACH PREVENTS A HARMFUL "FIX", not a noisy
 *    one: `grey` (greysexual / greygender — a community's own name for itself),
 *    `labour` (International Labour Organization / Labour Party — an
 *    organisation's legal name), and `haemo`+philus (Haemophilus, a Latin
 *    binomial). `analys` is excluded because analyses/analysis are correct
 *    American and it is not a British spelling at all.
 *
 * 4. THE LOOKAHEADS SURVIVE. organis[aei] excludes organism; programme(?!d)
 *    excludes programmed — the exact false positive 99991789819393 had to assert
 *    around. Dropping one silently re-adds ~24 rows of pure regex artifact.
 *
 * 5. THE LEAD ANCHOR SURVIVES. Unanchored, "refers to" matches correct prose
 *    mid-sentence — the same trap the sibling unresolved_disambiguation arm
 *    already documents.
 *
 * 6. THE RULE IS A SIBLING, NOT A REPLACEMENT. tag-lead-is-not-an-encyclopedia-
 *    lead (314) bans official names, classifications, founding dates and
 *    nationality clauses. "X refers to" is none of those. The migration asserts
 *    314 is still there precisely so a later pass cannot fold one into the other
 *    and lose half the coverage.
 *
 * 7. THE VERSION IS PUBLISHED. styleguide_compile() freezes profiles at publish
 *    time and getVoicePrompt() serves the frozen row, so a rule inserted without
 *    publishing leaves the fleet on the old prompt while every check reports
 *    success.
 */

const MIGRATION = '99991789858199_tag_lead_register_and_spelling_signals.sql';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Comments only at LINE START, so an explanatory header cannot satisfy an
 *  assertion about executable SQL. The header of this very migration names
 *  `grey`, `labour` and `analys` while the pattern must not contain them. */
const stripComments = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

const statements = stripComments(sql);
const verify = sql.slice(sql.indexOf('do $verify$'));

/** The jsonb the sentinel actually BUILDS. Scoped deliberately: the verify
 *  block below restates every key name in its own `?&` guard, so asserting key
 *  presence over the whole file is satisfied by the postcondition while the arm
 *  it describes has been deleted. Caught by mutation M8. */
const builtObject = (() => {
  const start = statements.indexOf('jsonb_build_object(');
  const end = statements.indexOf('into v', start);
  return start < 0 || end < 0 ? '' : statements.slice(start, end);
})();

/** The Commonwealth token list as an isolated string literal, so assertions
 *  about it cannot be satisfied by prose elsewhere in the file. */
const commonwealthPattern = (() => {
  const m = statements.match(/~\*\s*'(\(colour\|[^']*)'/);
  return m ? m[1] : '';
})();

describe('99991789858199 — lead register rule + counters', () => {
  it('writes no prose: unified_tags is only ever READ', () => {
    expect(statements).not.toMatch(/update\s+unified_tags/i);
    expect(statements).not.toMatch(/insert\s+into\s+unified_tags/i);
    expect(statements).not.toMatch(/delete\s+from\s+unified_tags/i);
    // and no actor is declared, because nothing is written
    expect(statements).not.toMatch(/set_config\s*\(\s*'app\.actor'/i);
  });

  it('installs the rule as a sibling at 315, not a replacement for 314', () => {
    expect(statements).toContain("'tag-lead-states-the-meaning-not-the-term'");
    expect(statements).toMatch(/'should'/);
    expect(statements).toMatch(/'persona'/);
    expect(statements).toMatch(/\b315\b/);
    expect(statements).toMatch(/array\['tag'\]/);
    // the sibling must still be asserted present — this is what stops a later
    // pass folding the two rules together and losing half the coverage
    expect(verify).toContain("'tag-lead-is-not-an-encyclopedia-lead'");
    expect(verify).toMatch(/sort_order\s*=\s*314/);
  });

  it('carries a rationale even though `should` is exempt from the CHECK', () => {
    expect(statements).toMatch(/rationale is not null/);
    expect(statements).toMatch(/meta description/i);
  });

  it('publishes through the ungated core with a NULL actor', () => {
    expect(statements).toMatch(/_styleguide_publish_core\(/);
    expect(statements).toMatch(/'minor'/);
    // the gated entry point needs an admin JWT a migration does not have
    expect(statements).not.toMatch(/select\s+public\.styleguide_publish\(/);
    // and the guard must check the PUBLISHED TEXT, not just the rows
    expect(verify).toMatch(/compiled_prompt/);
    expect(verify).toContain("'1.5.0'");
    expect(verify).toContain('Open with the meaning, not with the term');
  });

  it('keeps every pre-existing sentinel key and adds exactly two', () => {
    for (const key of [
      'truncated_description',
      'stamp_as_definition',
      'unresolved_disambiguation',
      'surname_stub',
      'whitespace_dirty',
      'refers_to_lead',
      'commonwealth_in_own_voice',
    ]) {
      expect(builtObject).toContain(`'${key}'`);
    }
    expect(builtObject).not.toBe('');
    // the probe must still report its own failure rather than zeros
    expect(statements).toMatch(/'probe_ok',\s*false/);
    expect(statements).toMatch(/exception when others then/);
  });

  it('anchors the refers_to_lead arm to the opening clause', () => {
    const arm = statements.slice(statements.indexOf("'refers_to_lead'"));
    expect(arm).toMatch(/\^\[\^\.!\?\]\{0,60\}/);
    expect(arm).toMatch(/refers\? to/);
  });

  it('scopes the Commonwealth counter to our own authored voice by length', () => {
    const arm = statements.slice(statements.indexOf("'commonwealth_in_own_voice'"));
    expect(arm).toMatch(/length\(d\)\s*<\s*200/);
  });

  it('excludes the three tokens whose "fix" would be harmful', () => {
    expect(commonwealthPattern).not.toBe('');
    // a community's own spelling of itself
    expect(commonwealthPattern).not.toMatch(/\bgrey\b/);
    // an organisation's legal name
    expect(commonwealthPattern).not.toContain('labour');
    // not a British spelling at all — analyses/analysis are correct American
    expect(commonwealthPattern).not.toContain('analys');
  });

  it('keeps the three lookaheads that exclude correct American words', () => {
    expect(commonwealthPattern).toContain('programme(?!d)');
    expect(commonwealthPattern).toContain('haemo(?!philus)');
    expect(commonwealthPattern).toContain('organis[aei]');
    // the bare forms would re-add ~24 rows of pure artifact
    expect(commonwealthPattern).not.toMatch(/\|organis\|/);
    expect(commonwealthPattern).not.toMatch(/\|programme\|/);
  });

  it('still counts the tokens that produced the live finding', () => {
    for (const tok of ['colour', 'centre', 'litre', 'recognis', 'behaviour']) {
      expect(commonwealthPattern).toContain(tok);
    }
  });

  it('asserts the new arms MEASURE something rather than merely existing', () => {
    // a zero here is a broken regex, not a clean corpus — both were hand-read
    expect(verify).toMatch(/refers_to_lead'\)::int\s*<\s*50/);
    expect(verify).toMatch(/commonwealth_in_own_voice'\)::int\s*<\s*1/);
  });

  it('has postconditions that cannot be neutered while reading as intact', () => {
    expect(verify).not.toMatch(/\b(and|or|where|if)\s+false\b/);
    expect(verify).not.toMatch(/=\s*false\b/);
    // every guard must still raise
    const raises = (verify.match(/raise exception/g) ?? []).length;
    expect(raises).toBeGreaterThanOrEqual(8);
    // and must actually read the objects it claims to check
    expect(verify).toMatch(/tag_prose_standard_signals\(\)/);
    expect(verify).toMatch(/from styleguide_rules/);
    expect(verify).toMatch(/from styleguide_versions/);
  });
});

describe('check-pipeline-health.mjs consumes both keys', () => {
  const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

  it('requires both keys, so a missing one fails instead of reading as zero', () => {
    const loop = health.slice(health.indexOf("for (const key of ['truncated_description'"));
    expect(loop.slice(0, 400)).toContain("'refers_to_lead'");
    expect(loop.slice(0, 400)).toContain("'commonwealth_in_own_voice'");
  });

  it('gates both on GROWTH against a named ceiling', () => {
    expect(health).toMatch(/const REFERS_TO_LEAD_CEILING = \d+/);
    expect(health).toMatch(/const COMMONWEALTH_OWN_VOICE_CEILING = \d+/);
    expect(health).toMatch(/refersTo > REFERS_TO_LEAD_CEILING/);
    expect(health).toMatch(/britSpelling > COMMONWEALTH_OWN_VOICE_CEILING/);
    // fetched from the response, not invented
    expect(health).toMatch(/ts\.refers_to_lead/);
    expect(health).toMatch(/ts\.commonwealth_in_own_voice/);
  });

  it('warns rather than passing silently while a backlog stands', () => {
    expect(health).toMatch(/open by announcing the term/);
    expect(health).toMatch(/Commonwealth spelling/);
  });

  it('tells the reader NOT to widen the spelling gate', () => {
    const section = health.slice(health.indexOf('britSpelling > COMMONWEALTH_OWN_VOICE_CEILING'));
    expect(section.slice(0, 1200)).toMatch(/greysexual/);
    expect(section.slice(0, 1200)).toMatch(/Haemophilus/);
  });

  it('only reports all-clear when the two new counters are clear too', () => {
    const ok = health.slice(
      health.indexOf('conform to the structural standard') - 400,
      health.indexOf('conform to the structural standard'),
    );
    expect(ok).toContain('refersTo === 0');
    expect(ok).toContain('britSpelling === 0');
  });
});
