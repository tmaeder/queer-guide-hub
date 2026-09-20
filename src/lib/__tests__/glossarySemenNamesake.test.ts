import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the `semen` namesake repair.
 *
 * The migration is deliberately NARROWER than it looks: it cleans a deprecated
 * row and refuses two reader-facing fixes that need a human. The tests that
 * matter most are the ones asserting what it does NOT do.
 */

const FILE = join(
  __dirname,
  '../../../supabase/migrations',
  '99991789893281_glossary_semen_namesake.sql',
);

const raw = readFileSync(FILE, 'utf8');

// Comments quote the very strings the statements guard on, so every assertion
// below runs against comment-stripped source. Without this a `toContain` is
// satisfied by the header while the statement is gone.
const stripped = raw
  .split('\n')
  .map((l) => {
    const i = l.indexOf('--');
    return i === -1 ? l : l.slice(0, i);
  })
  .join('\n');

const verifyAt = stripped.indexOf('do $verify$');
const writes = stripped.slice(0, verifyAt);
const verify = stripped.slice(verifyAt);

const updates = writes.split(/\n(?=update\s)/i).filter((s) => /^update/i.test(s.trim()));

describe('semen namesake repair — what it writes', () => {
  it('nulls the Indonesian district body, content-guarded', () => {
    const s = updates.find((u) => /long_description\s*=\s*null/.test(u)) ?? '';
    expect(s).toMatch(/slug\s*=\s*'semen'/);
    expect(s).toMatch(/long_description ilike '%Kediri Regency%'/);
  });

  it('replaces the essentialist description, content-guarded', () => {
    const s = updates.find((u) => /set description =/.test(u)) ?? '';
    expect(s).toMatch(/description ilike '%hermaphroditic animals%'/);
    // The negative must be scoped to the SET clause: the WHERE clause quotes
    // the defect verbatim as its own guard, so asserting over the whole
    // statement fails on correct code. Same trap as 60000301100000.
    const setClause = s.slice(0, s.search(/\bwhere\b/i));
    expect(setClause).not.toMatch(/hermaphroditic/i);
    expect(setClause).not.toMatch(/male and [^']*animals/i);
  });

  it('disarms the publish-on-revive flag on this row only', () => {
    const s = updates.find((u) => /set seo_indexable = false/.test(u)) ?? '';
    expect(s).toMatch(/slug\s*=\s*'semen'/);
    expect(s).toMatch(/status\s*=\s*'deprecated'/);
    // a corpus-wide sweep of the 4,080 armed rows is explicitly out of scope
    expect(s).not.toMatch(/where\s+seo_indexable\s*;/);
  });

  it('retypes the alias without approving it', () => {
    const s = updates.find((u) => /tag_aliases/.test(u)) ?? '';
    expect(s).toMatch(/set alias_type = 'synonym'/);
    expect(s).not.toMatch(/review_status/);
  });

  it('declares an actor', () => {
    expect(writes).toContain('migration:99991789893281');
  });
});

describe('semen namesake repair — what it refuses', () => {
  it('never revives the row (tag_reject_alias_shadow would refuse it anyway)', () => {
    expect(writes).not.toMatch(/set\s+status\s*=\s*'active'/i);
    expect(writes).not.toMatch(/status\s*=\s*'active'[\s\S]{0,80}slug\s*=\s*'semen'/i);
  });

  it('never approves the alias — that would create an auto-tagging rule', () => {
    expect(writes).not.toMatch(/review_status\s*=\s*'approved'/);
  });

  it('never deletes the alias — that would unblock revival', () => {
    expect(writes).not.toMatch(/delete\s+from\s+tag_aliases/i);
  });

  it('never renames or re-slugs the live canonical', () => {
    expect(writes).not.toMatch(/set\s+name\s*=/i);
    expect(writes).not.toMatch(/set\s+slug\s*=/i);
    expect(writes).not.toMatch(/merged_into_id/);
  });

  it('never touches the live sibling rows', () => {
    for (const u of updates) {
      expect(u).not.toMatch(/slug\s*=\s*'(jizz|sperm|cum|ejaculation)'/);
    }
  });
});

describe('postconditions', () => {
  it('assert the district is gone from ALL THREE prose fields', () => {
    for (const col of ['description', 'short_description', 'long_description']) {
      // the SQL is column-aligned, so the gap before `ilike` is several spaces
      expect(verify).toMatch(new RegExp(`v_row\\.${col},''\\)\\s+ilike '%Kediri%'`));
    }
  });

  it('assert the row stays deprecated and disarmed', () => {
    expect(verify).toMatch(/status is distinct from 'deprecated'/);
    expect(verify).toMatch(/if v_row\.seo_indexable then/);
  });

  it('assert the alias still routes NOTHING', () => {
    // typed-synonym alone is satisfied by a mutation that also approves it
    expect(verify).toMatch(/v_alias\.review_status <> 'auto'/);
    expect(verify).toMatch(/v_alias\.alias_type is null/);
  });

  it('call the real thin-page predicate rather than restating it', () => {
    expect(verify).toMatch(/tag_has_prose\(v_row\.description, v_row\.short_description\)/);
  });

  it('assert the live siblings survive', () => {
    expect(verify).toMatch(/'sperm'/);
    expect(verify).toMatch(/'jizz'/);
    expect(verify).toMatch(/'ejaculation'/);
  });

  it('are not loosened or short-circuited', () => {
    expect(verify).not.toMatch(/if\s+false\s+then/);
    expect(verify).not.toMatch(/where\s+false\s+and/);
    expect(verify).not.toMatch(/v_bad\s*<\s*0/);
  });
});
