import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `city-agentic-enrich` is the second consumer of the published editorial
 * standard, and the first one that writes to LIVE published city columns.
 *
 * Baseline, measured on 328 real runs before this shipped (2026-06-07 →
 * 2026-09-11): 16.8% of generated descriptions and 21.8% of generated hooks
 * carried a styleguide avoid phrase, and `vibrant` alone was 95 of ~124 hits.
 *
 * The risk it carries is NOT bad content — `parseAIResponse` returns null on
 * unparseable output and the run records `no_ai` — it is SILENCE: prepending
 * ~13.5k characters to a 1.8k bare-JSON prompt, on models that already need
 * `chat_template_kwargs:{thinking:false}` to answer at all, can stop the JSON
 * parsing and quietly enrich nothing. That is why it ships `off` and why the
 * lever is a registry value rather than a constant.
 *
 * Asserted against COMMENT-STRIPPED source: both files' headers quote every
 * string these tests look for, so an unstripped check would pass on the prose
 * with the wiring deleted — the trap CLAUDE.md records twice.
 */

const FN = join(process.cwd(), 'supabase', 'functions');

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

// The migration header quotes the Busan sentence and names every column it touches,
// so an unstripped check passes on the prose with the INSERT deleted.
function stripSql(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const enrich = stripComments(readFileSync(join(FN, '_shared', 'ai-enrichment.ts'), 'utf8'));
const city = stripComments(readFileSync(join(FN, 'city-agentic-enrich', 'index.ts'), 'utf8'));

describe('city moat extractor — voice wiring', () => {
  it('imports the shared helper rather than restating the voice', () => {
    // The whole point of the styleguide system is one source of truth. A prompt
    // that hand-copies "do not say vibrant" recreates the three-prose-copies
    // problem it exists to end.
    expect(enrich).toMatch(/import\s*\{[^}]*withVoice[^}]*\}\s*from\s*'\.\/voice-style\.ts'/);
  });

  it('defaults to off, so the arm that ships is the arm that was measured', () => {
    expect(enrich).toMatch(/const voice:\s*VoiceSetting\s*=\s*input\.voice\s*\?\?\s*'off'/);
  });

  it('leaves the prompt byte-identical when off', () => {
    // The rollback has to be exact, not approximate.
    expect(enrich).toMatch(
      /voice === 'off'\s*\?\s*CITY_MOAT_SYSTEM_PROMPT\s*:\s*await withVoice\(CITY_MOAT_SYSTEM_PROMPT,\s*voice\)/,
    );
  });

  it('sends the resolved prompt, not the raw constant', () => {
    // The bug this catches is building `systemPrompt` and then not using it.
    const call = enrich.match(/messages:\s*\[([\s\S]*?)\]/)?.[0] ?? '';
    expect(enrich).toMatch(/role:\s*'system',\s*content:\s*systemPrompt/);
    expect(call).not.toMatch(/content:\s*CITY_MOAT_SYSTEM_PROMPT/);
  });

  it('stamps the arm after parsing and never asks the model for it', () => {
    // Adding these to CITY_MOAT_KEYS would ask the model to report its own
    // system prompt — meaningless, and a way for it to misreport which arm ran.
    const keys = enrich.match(/const CITY_MOAT_KEYS = \[([\s\S]*?)\]/)?.[1] ?? '';
    expect(keys).not.toMatch(/voice_profile|voice_system_chars/);
    expect(enrich).toMatch(/\.\.\.parsed,\s*voice_profile:\s*voice/);
  });
});

describe('city-agentic-enrich — the rollout lever', () => {
  it('reads the registry so the flip needs no deploy and no migration', () => {
    expect(city).toMatch(/from\('admin_automations'\)[\s\S]{0,120}city_agentic_enrich/);
    expect(city).toMatch(/conditions/);
  });

  it('lets an explicit body param win, for the A/B', () => {
    expect(city).toMatch(/typeof body\.voice === 'string'/);
  });

  it('falls back to off on an unrecognised value instead of throwing', () => {
    // A typo in a hand-edited registry row must not take the hourly cron down.
    expect(city).toMatch(/VOICE_VALUES\.includes\(want\)/);
    expect(city).toMatch(/let voice:\s*VoiceSetting\s*=\s*'off'/);
  });

  it('offers off as a real option, not just the three profiles', () => {
    const vals = city.match(/VOICE_VALUES[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    for (const v of ["'off'", "'compact'", "'core'", "'full'"]) expect(vals).toContain(v);
  });

  it('passes the resolved setting into the extractor', () => {
    // Scoped to the call's OWN argument object. A `[\s\S]*?voice,` span reaches
    // forward to the `voice_profile: … ?? voice,` in the results push and stays
    // green with the argument deleted — measured, that mutation was missed.
    const start = city.indexOf('researchEnrichCityFromSources(supabase, {');
    expect(start, 'the extractor call moved or was renamed').toBeGreaterThan(-1);
    const end = city.indexOf('}))', start);
    expect(end, 'could not find the end of the extractor call').toBeGreaterThan(start);
    const args = city.slice(start, end);
    expect(args).toMatch(/(^|[\s,{])voice,/);
  });

  it('reports which arm ran in the response envelope', () => {
    expect(city).toMatch(/jsonResponse\(\{[^}]*voice,/);
  });
});

describe('best_time_to_visit is review-gated, not auto-published', () => {
  // The voice A/B (2026-09-11) filled this field on 2 of 5 cities where the control
  // arm filled 0 of 5 — the composer had returned null on 209/209 cities before it —
  // and one of the two dated the Busan Queer Culture Festival to "June or July". It
  // is a September/October event. At the 0.8 auto-publish bar that sentence ships,
  // and no drift regex sees it: the register is fine, the fact is wrong.

  const autoBlock = (() => {
    const start = city.indexOf('if (highConf) {');
    return start < 0 ? '' : city.slice(start, city.indexOf('\n      }', start));
  })();

  it('has an auto-apply block to test against', () => {
    // Guards every assertion below: an empty slice would make them all vacuous.
    expect(autoBlock).toContain('update.description');
  });

  it('does not auto-apply the field', () => {
    expect(autoBlock).not.toMatch(/best_time_to_visit/);
  });

  it('still auto-applies the two siblings that restate their sources', () => {
    // description and local_customs paraphrase the grounding text; only travel
    // timing has to reach past it. Gating all three would stall enrichment.
    expect(autoBlock).toMatch(/update\.description = ai\.description/);
    expect(autoBlock).toMatch(/update\.local_customs = ai\.local_customs/);
  });

  it('queues it for a human instead', () => {
    expect(city).toMatch(/gatedProposals\.push\(\{[\s\S]{0,200}field:\s*'best_time_to_visit'/);
  });

  it('keeps fill-if-empty, so a curated value is never offered for overwrite', () => {
    expect(city).toMatch(/if \(ai\.best_time_to_visit && !c\.best_time_to_visit\) \{/);
  });
});

describe('the review registry row that makes the queue approvable', () => {
  // approve_entity_review() RAISEs 'unsupported review field' when the registry has
  // no row, so shipping the gate without the row builds a queue that collects human
  // decisions and discards them — the failure this repo already shipped once.
  const sql = stripSql(
    readFileSync(
      join(
        process.cwd(),
        'supabase',
        'migrations',
        '20490210090000_best_time_to_visit_review_gated.sql',
      ),
      'utf8',
    ),
  );

  it('registers the field against the real column', () => {
    expect(sql).toMatch(/INSERT INTO public\.review_field_registry/);
    expect(sql).toMatch(/'city',\s*'best_time_to_visit'/);
    expect(sql).toMatch(/'cities',\s*'best_time_to_visit'/);
  });

  it('refuses an empty proposal rather than blanking the column', () => {
    expect(sql).toMatch(/'text_required'/);
  });

  it('is NOT batchable', () => {
    // approve_entity_review_batch approves every batchable open row with no human
    // reading it. A batchable row here puts the fabricated sentence straight back.
    const values = sql.slice(sql.indexOf('VALUES'), sql.indexOf('ON CONFLICT'));
    expect(values).toMatch(/false,\s*NULL,\s*true/);
  });

  it('asserts the batchable rule rather than merely setting it', () => {
    const verify = sql.slice(sql.indexOf('$verify$'));
    expect(verify).toMatch(/IF reg\.batchable THEN[\s\S]{0,200}RAISE EXCEPTION/);
  });

  it('refuses to gate the two siblings', () => {
    const verify = sql.slice(sql.indexOf('$verify$'));
    expect(verify).toMatch(/'description',\s*'local_customs'[\s\S]{0,200}RAISE EXCEPTION/);
  });
});

describe('the dry run is usable as a measurement', () => {
  it('returns the generated proposal, but only when nothing is written', () => {
    // A dry run that hides the model's output cannot be used to compare two
    // prompt arms, which is the only safe way to evaluate this change.
    expect(city).toMatch(/\.\.\.\(dryRun\s*$/m);
    const block = city.match(/\.\.\.\(dryRun([\s\S]*?): \{\}\)/)?.[1] ?? '';
    expect(block).toMatch(/proposal:/);
    for (const f of ['description', 'editorial_hook', 'best_time_to_visit', 'local_customs']) {
      expect(block).toContain(f);
    }
    expect(block).toMatch(/voice_profile/);
  });

  it('still writes nothing in a dry run', () => {
    // The measurement depends on this staying true.
    expect(city).toMatch(/if \(!dryRun\) \{/);
    expect(city).toMatch(/if \(dryRun\) return/);
  });
});
