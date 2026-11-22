// Guards 99991795377240: the partial index must keep matching the fixed predicate of
// marketplace_relevance_candidates(), or the planner stops using it and the query goes back
// to scanning every pending staging row (the 8s timeout that auto-paused the drain).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'supabase/migrations');
const read = (f: string) =>
  readFileSync(join(dir, f), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
const norm = (s: string) => s.replace(/\s+/g, '').replace(/\bs\./g, '');

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const indexFile = files.find((f) => f.endsWith('_mp_relevance_candidates_index.sql'))!;
const fnFile = files
  .filter((f) =>
    /create (or replace )?function public\.marketplace_relevance_candidates/i.test(read(f)),
  )
  .pop()!;

const TERMS = [
  "target_table='marketplace_listings'",
  "disposition='pending'",
  "ai_validation_status='approved'",
  'classification_resultisnull',
  "dedup_statusin('pending','unique','merge_candidate')",
];

describe('marketplace relevance candidates index', () => {
  const index = norm(read(indexFile));
  const fn = norm(read(fnFile));

  it.each(TERMS)('index and function both carry %s', (term) => {
    expect(index).toContain(term);
    expect(fn).toContain(term);
  });

  it('is ordered by the candidate sort key', () => {
    expect(index).toContain('onpublic.ingestion_staging(created_at,id)');
  });
});
