import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(
  process.cwd(),
  'supabase',
  'migrations',
  '51600101100200_tag_suggestion_approve_guard.sql',
);

/** Comment-stripped: this header quotes the identifiers the guards look for. */
const sql = (): string =>
  readFileSync(FILE, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

const applyBlock = (): string => {
  const s = sql();
  const end = s.toLowerCase().indexOf('do $verify$');
  expect(end).toBeGreaterThan(0);
  return s.slice(0, end);
};

const verifyBlock = (): string => {
  const s = sql();
  const start = s.toLowerCase().indexOf('do $verify$');
  expect(start).toBeGreaterThan(0);
  return s.slice(start);
};

describe('approving a near-duplicate warning cannot assign a tag to a tag', () => {
  it('refuses on entity_type, the structural truth, not on the source name', () => {
    const apply = applyBlock();
    const at = apply.indexOf('INTO v_blocked');
    expect(at).toBeGreaterThan(0);
    const stmt = apply.slice(at, at + 260);
    expect(stmt).toMatch(/entity_type = 'tag'/);
    // source='duplicate_warning' is the current producer, not the invariant; a
    // new producer emitting the same shape must be caught too.
    expect(stmt).not.toMatch(/duplicate_warning/);
  });

  it('raises rather than silently skipping, so the reviewer is told', () => {
    const apply = applyBlock();
    expect(apply).toMatch(/IF v_blocked > 0 THEN\s+RAISE EXCEPTION/);
    expect(apply).toMatch(/USING ERRCODE = '22023'/);
  });

  it('the refusal says what to do instead', () => {
    expect(applyBlock()).toMatch(/MERGING the two tags, or by rejecting it/);
  });

  it('still approves ordinary suggestions — the guard is not a blanket refusal', () => {
    const apply = applyBlock();
    expect(apply).toMatch(
      /INSERT INTO public\.unified_tag_assignments \(tag_id, entity_id, entity_type\)/,
    );
    expect(apply).toMatch(/approved_count := approved_count \+ 1/);
  });

  it('keeps the admin gate ahead of everything', () => {
    const apply = applyBlock();
    const admin = apply.indexOf("has_role_jwt('admin'::app_role)");
    const guard = apply.indexOf('INTO v_blocked');
    expect(admin).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(admin);
  });

  it('proves the guard by asserting its OWN sqlstate, not merely that it raised', () => {
    const verify = verifyBlock();
    // A migration has no JWT, so the admin check raises 42501 first. Accepting
    // that as proof is the vacuous-assertion class: claim admin locally, then
    // assert 22023 alone.
    expect(verify).toMatch(/set_config\('request\.jwt\.claims'/);
    expect(verify).toMatch(/WHEN sqlstate '22023' THEN v_ok := true/);
    expect(verify).not.toMatch(/WHEN sqlstate '42501' THEN v_ok := true/);
  });

  it('carries a positive control so a blanket refusal cannot pass', () => {
    expect(verifyBlock()).toMatch(/the guard refuses calls that contain no tag-on-tag suggestion/);
  });
});

describe('the queue row names both sides of the pair', () => {
  it('resolves the flagged tag and the matched tag by id', () => {
    const apply = applyBlock();
    expect(apply).toMatch(/LEFT JOIN unified_tags flagged ON flagged\.id = ts\.entity_id/);
    expect(apply).toMatch(/LEFT JOIN unified_tags match ON match\.id = ts\.tag_id/);
    expect(apply).toMatch(/flagged\.name \|\| ' ⇄ ' \|\| match\.name/);
  });

  it('keeps the similarity message rather than discarding it', () => {
    expect(applyBlock()).toMatch(/THEN COALESCE\(ts\.suggested_tag_name, ts\.source\)/);
  });

  it('falls back to the old title for any non-tag suggestion', () => {
    expect(applyBlock()).toMatch(
      /ELSE COALESCE\(ts\.suggested_tag_name, ts\.suggested_name, 'Tag suggestion'::text\)/,
    );
  });

  it('flags the row so the UI can see approve is unsupported', () => {
    expect(applyBlock()).toMatch(/jsonb_build_object\('approve_unsupported', true\)/);
  });

  it('asserts the rendered title actually contains both sides', () => {
    expect(verifyBlock()).toMatch(/position\(' ⇄ ' in v_title\) = 0/);
  });
});
