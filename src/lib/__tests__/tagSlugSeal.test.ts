import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase/migrations');

function latestDefining(fnName: string): string {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => readFileSync(join(DIR, f), 'utf8').includes(`FUNCTION public.${fnName}`))
    .sort();
  if (files.length === 0) throw new Error(`no migration defines ${fnName}`);
  return readFileSync(join(DIR, files[files.length - 1]), 'utf8');
}

describe('unified_tags_normalize_slug seal', () => {
  const sql = latestDefining('unified_tags_normalize_slug');

  it('prefers the name-derived slug when the name is non-ASCII', () => {
    // The seal is the whole point: a caller-supplied slug must not win for a
    // name carrying a diacritic, which is how "Bühne" became "b-hne".
    expect(sql).toMatch(/\[\^\\x00-\\x7F\]/);
  });

  it('still honours a caller slug for a pure-ASCII name', () => {
    // mat-silicone (4,643 uses), news-education, occ-pride, genre-horror are
    // deliberate namespace prefixes on ASCII names. If this branch disappears
    // the seal starts renaming them and breaking thousands of links.
    expect(sql).toMatch(/coalesce\(NEW\.slug, NEW\.name\)/i);
  });
});
