import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Schloss Nymphenburg, München" was a palace minted as a `cities` row by the
 * personality-birth-place path. The migration deletes it and repoints its one
 * referrer (Ludwig II.) to Munich. `cities.id` has no FK that clears referrers,
 * so statement ORDER is what keeps the delete honest: snapshot and repoint must
 * precede the DELETE, or the migration succeeds and leaves a dangling uuid.
 *
 * Asserted over comment-stripped SQL — the header quotes the reasoning.
 */

const SQL = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '99991791574410_delete_schloss_nymphenburg_city_shell.sql',
  ),
  'utf8',
)
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const SHELL = 'b576ff9c-3f1d-478b-b044-73083555a36d';
const MUNICH = 'fb46a103-3465-4112-ae6f-e999722f70fb';

const at = (needle: string) => {
  const i = SQL.indexOf(needle);
  expect(i, `missing: ${needle}`).toBeGreaterThan(-1);
  return i;
};

describe('Schloss Nymphenburg city shell deletion', () => {
  it('targets one explicit id, never a predicate', () => {
    expect(SQL).toContain(`c_shell   constant uuid := '${SHELL}'`);
    expect(SQL).toContain(`c_munich  constant uuid := '${MUNICH}'`);
    expect(SQL).toMatch(/DELETE FROM public\.cities WHERE id = c_shell;/);
    expect(SQL).not.toMatch(/DELETE FROM public\.cities WHERE (name|data_source|shell_status)/);
  });

  it('repoints the referrer to Munich instead of nulling it', () => {
    expect(SQL).toContain('UPDATE public.personalities SET city_id = c_munich WHERE city_id = c_shell;');
    expect(SQL).not.toMatch(/SET city_id = NULL/);
  });

  it('snapshots and repoints BEFORE the delete', () => {
    const del = at('DELETE FROM public.cities WHERE id = c_shell;');
    expect(at('INSERT INTO public.nonplace_city_deletion_audit')).toBeLessThan(del);
    expect(at('SET city_id = c_munich')).toBeLessThan(del);
    expect(at('SET death_city_id = c_munich')).toBeLessThan(del);
    expect(at('DELETE FROM public.city_quality_signals')).toBeLessThan(del);
    expect(at("content_type = 'city' AND content_id = c_shell")).toBeLessThan(del);
  });

  it('refuses a row that gained content or was merged', () => {
    expect(SQL).toMatch(/IF v_row\.duplicate_of_id IS NOT NULL THEN\s+RAISE EXCEPTION/);
    expect(SQL).toMatch(/IF v_n > 0 THEN\s+RAISE EXCEPTION 'schloss nymphenburg aborted: row gained/);
  });

  it('asserts postconditions after the delete and each one RAISES', () => {
    const del = at('DELETE FROM public.cities WHERE id = c_shell;');
    const post = SQL.slice(del);
    for (const msg of [
      'city row survived',
      'spine row survived',
      'dangling personality pointer',
      'Ludwig II. not on Munich',
      'expected 1 audit snapshot',
    ]) {
      expect(post).toMatch(new RegExp(`THEN RAISE EXCEPTION 'schloss nymphenburg: [^']*${msg.replace('.', '\\.')}`));
    }
  });
});
