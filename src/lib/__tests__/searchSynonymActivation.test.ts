import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The 629-row synonym activation must never pick up the ordinary-word set.
 *
 * `pep` is the one that matters most and the reason this file exists: the row
 * is `pep -> amphetamine` (German slang), while on this platform PEP is
 * post-exposure prophylaxis — the 72-hour HIV emergency course — and the corpus
 * carries live PEP tags. Activating it would expand a search for HIV emergency
 * care with "amphetamine". A later edit that widens the UPDATE, or drops a
 * term from the array, has no other alarm.
 */
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const FILE = '99991791096878_activate_tag_alias_synonyms.sql';

/** Strip `--` line comments so an assertion cannot be satisfied by prose. */
function statements(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      let inStr = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'") inStr = !inStr;
        else if (!inStr && c === '-' && line[i + 1] === '-') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

describe('tag-alias synonym activation', () => {
  const raw = readFileSync(join(MIGRATIONS, FILE), 'utf8');
  const sql = statements(raw);

  it('the migration exists at the version the guard names', () => {
    // Guards against a renumber that leaves this test pointing at nothing —
    // a missing file would otherwise make every assertion below throw once,
    // which reads as a broken test rather than a missing migration.
    expect(readdirSync(MIGRATIONS)).toContain(FILE);
  });

  it('refuses pep — the HIV post-exposure-prophylaxis collision', () => {
    expect(sql).toMatch(/'pep'/);
    // and it must be inside the refusal array, not merely mentioned
    const arrayBlock = sql.slice(sql.indexOf('v_refused'), sql.indexOf('v_activated'));
    expect(arrayBlock).toMatch(/'pep'/);
  });

  it('refuses the ordinary-word set the precedent migration denied', () => {
    for (const term of ['speed', 'acid', 'grass', 'ice']) {
      expect(sql, `missing refusal: ${term}`).toMatch(new RegExp(`'${term}'`));
    }
  });

  it('refuses ordinary English words, names, and the substring-promiscuous rack', () => {
    for (const term of [
      'blow',
      'coke',
      'hash',
      'crack',
      'smack',
      'spice',
      'crystal',
      'bias',
      'doc',
      'rock',
      'jazz',
      'tech',
      'arts',
      'mixed',
      'upper',
      'downer',
      'scat',
      'slam',
      'nexus',
      'period',
      'rack',
      'molly',
      'sally',
      'tina',
      'facial',
    ]) {
      expect(sql, `missing refusal: ${term}`).toMatch(new RegExp(`'${term}'`));
    }
  });

  it('the UPDATE is gated on the refusal array and on an active tag', () => {
    const update = sql.slice(
      sql.indexOf('UPDATE public.search_synonyms'),
      sql.indexOf('GET DIAGNOSTICS'),
    );
    expect(update).toMatch(/lower\(s\.terms\[1\]\)\s*<>\s*ALL\s*\(v_refused\)/);
    expect(update).toMatch(/t\.status\s*=\s*'active'/);
    expect(update).toMatch(/s\.status\s*=\s*'approved'/);
  });

  it('asserts an absolute floor, never an absence', () => {
    // An assertion phrased as "no row from my list is still approved" passes
    // trivially against an empty set — the failure mode 20261007160400 shipped.
    expect(sql).toMatch(/v_active\s*<\s*600/);
    expect(sql).toMatch(/v_refused_rows\s*<\s*25/);
  });

  it('verifies the refusals did not reach active', () => {
    expect(sql).toMatch(/refused ordinary-word synonyms reached active/);
    const leakCheck = sql.slice(
      sql.indexOf('v_leaked'),
      sql.indexOf('refusal list has stopped matching'),
    );
    expect(leakCheck).toMatch(/status\s*=\s*'active'/);
    expect(leakCheck).toMatch(/'pep'/);
  });

  it('does not disable the alias bridge or the admin gate', () => {
    // The gate is sound and the admin UI implements it; this migration works
    // the backlog, it does not remove the mechanism.
    expect(sql).not.toMatch(/drop\s+trigger/i);
    expect(sql).not.toMatch(/tag_alias_sync_search_synonym/i);
    expect(sql).not.toMatch(/alter\s+table\s+public\.search_synonyms/i);
  });
});
