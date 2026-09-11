import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The voice frame exists TWICE and the two copies can drift.
 *
 * `styleguide_compile` (SQL) builds the prompt for anything that can reach the
 * database. `VOICE_FALLBACK_PROMPT` (supabase/functions/_shared/voice-style.ts)
 * is what edge functions use when it cannot. The body of the fallback is a
 * SNAPSHOT and is deliberately allowed to lag — a slightly old rule list is a
 * fine thing to serve during an outage, and chasing it would be busywork.
 *
 * The FRAME is different. The grounding clause and the non-negotiables are the
 * part that makes the prompt safe rather than merely current: they are what
 * tells a model that the data block is data, and what holds the fabrication and
 * outing lines regardless of what any row says. If someone tightens a
 * non-negotiable in SQL and the fallback keeps the old one, then every time
 * Supabase blips the fleet quietly runs on the superseded rule — and it will
 * pass every other test, because both copies are individually valid.
 *
 * So: stale rules are tolerated, a stale frame is not.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestCompileSql(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (/create\s+(or\s+replace\s+)?function\s+public\.styleguide_compile\s*\(/i.test(sql)) {
      return sql;
    }
  }
  throw new Error('no migration defines styleguide_compile');
}

const fallback = (() => {
  const src = readFileSync(
    join(process.cwd(), 'supabase', 'functions', '_shared', 'voice-style.ts'),
    'utf8',
  );
  const start = src.indexOf('export const VOICE_FALLBACK_PROMPT = `');
  expect(start).toBeGreaterThan(-1);
  return src.slice(start + 'export const VOICE_FALLBACK_PROMPT = `'.length, src.lastIndexOf('`'));
})();

/**
 * Pull the fixed sentences out of the SQL compiler. They are written there as
 * single-quoted literals concatenated with `||`, so doubled quotes are Postgres
 * escapes and have to be collapsed before comparing to the plain text the
 * fallback holds.
 */
function frameSentences(sql: string): string[] {
  const start = sql.indexOf('v_prompt :=');
  const end = sql.indexOf('v_doc :=', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const frame = sql.slice(start, end);
  return [...frame.matchAll(/'((?:[^']|'')*)'/g)]
    .map((m) => m[1].replace(/''/g, "'"))
    .filter((s) => s.trim().length > 25 && !s.includes('QUEER.GUIDE VOICE DATA'));
}

describe('voice-style fallback frame matches the SQL compiler', () => {
  const sentences = frameSentences(latestCompileSql());

  it('found the frame literals to compare (a zero-length list would pass vacuously)', () => {
    expect(sentences.length).toBeGreaterThanOrEqual(10);
  });

  it.each(sentences.map((s) => [s.slice(0, 60), s]))(
    'fallback contains the frame text: %s...',
    (_label, sentence) => {
      expect(fallback).toContain(sentence);
    },
  );

  it('fallback carries both fence markers', () => {
    expect(fallback).toContain('===== BEGIN QUEER.GUIDE VOICE DATA =====');
    expect(fallback).toContain('===== END QUEER.GUIDE VOICE DATA =====');
  });

  it('fallback is a real prompt, not a stub', () => {
    // getVoicePrompt treats anything under 500 characters coming back from the
    // database as a failure; a fallback below that bar would be one too.
    expect(fallback.length).toBeGreaterThan(5000);
    expect(fallback).toContain('## Non-negotiables');
  });
});
