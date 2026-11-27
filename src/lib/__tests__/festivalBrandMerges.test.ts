import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards 99991795778516: duplicate festival brands point at the brand they
 * duplicate, new editions follow that pointer, old slugs redirect, and an
 * unlisted brand is a 404/301 rather than a sign-in gate.
 */
const root = resolve(__dirname, '../../..');
const strip = (s: string) =>
  s
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
const sql = strip(
  readFileSync(
    resolve(root, 'supabase/migrations/99991795778516_festival_brand_merges_and_redirects.sql'),
    'utf8',
  ),
);
const detail = readFileSync(resolve(root, 'functions/_lib/detail.ts'), 'utf8');
const page = readFileSync(resolve(root, 'src/pages/FestivalDetail.tsx'), 'utf8');

describe('festival brand merges', () => {
  it('only an unlisted row may be merged, and never into itself', () => {
    expect(sql).toMatch(
      /check \(merged_into_id is null or \(not listed and merged_into_id <> id\)\)/,
    );
  });

  it('patches the linker to follow merged_into_id at exactly one anchor', () => {
    expect(sql).toContain("v_from text := 'select f.id into v_fid'");
    expect(sql).toContain("v_to text := 'select coalesce(f.merged_into_id, f.id) into v_fid'");
    expect(sql).toMatch(/if v_n <> 1 then\s+raise exception/);
    expect(sql).toContain('execute replace(v_src, v_from, v_to)');
  });

  it('keeps redirects in step with merged_into_id', () => {
    expect(sql).toMatch(
      /after insert or update of merged_into_id, slug on public\.festivals\s+for each row execute function public\.festival_merge_slug_redirect\(\)/,
    );
    expect(sql).toContain('grant select on public.festival_slug_redirects to anon, authenticated');
    expect(sql).toContain('revoke all on public.festival_slug_redirects from anon, authenticated');
  });

  it('moves an edition only when the keeper has none that week', () => {
    const move = sql.slice(sql.indexOf('set festival_id = d.merged_into_id'));
    expect(move.slice(0, 600)).toMatch(/and not exists \(\s+select 1 from public\.events k/);
  });

  it('asserts its end state', () => {
    for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'])
      expect(sql).toMatch(new RegExp(`raise exception '${p} failed`));
    expect(sql).not.toMatch(/where false|if \(false\)/i);
  });

  it('the edge treats only a listed brand as gated and 301s merged slugs', () => {
    expect(detail).toContain('`slug=eq.${encodeURIComponent(slug)}&listed=eq.true`');
    const entry = detail.slice(detail.indexOf("redirectTable: 'festival_slug_redirects'"));
    expect(entry.slice(0, 200)).toContain("entityFilter: 'listed=eq.true'");
  });

  it('the detail page follows the redirect for in-app navigation', () => {
    expect(page).toContain("redirectTable: 'festival_slug_redirects'");
    expect(page).toMatch(/navigate\(`\/festivals\/\$\{redirectSlug\}`, \{ replace: true \}\)/);
  });
});
