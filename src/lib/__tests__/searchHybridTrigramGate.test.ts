import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards migration 99991793759708 (search_hybrid trigram gate + city match).
 * Assertions run on comment-stripped SQL: the header quotes the old shapes.
 */
const MIGRATION = '99991793759708_search_hybrid_trigram_gate_and_city_match';
const raw = readFileSync(resolve(__dirname, `../../../supabase/migrations/${MIGRATION}.sql`), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const hybrid = sql.slice(
  sql.indexOf('FUNCTION api_private.search_hybrid'),
  sql.indexOf('FUNCTION api_private.search_facets'),
);
const facets = sql.slice(sql.indexOf('FUNCTION api_private.search_facets'), sql.indexOf('do $verify$'));

describe('search_hybrid trigram gate', () => {
  it('admits trigram matches only when FTS finds fewer than 20 docs', () => {
    expect(hybrid).toMatch(/ftsonly as materialized \(select sd\.doc_id from public\.search_documents sd, p2 p where p\.eff_q is not null and sd\.search_tsv @@/);
    expect(hybrid).toContain('(select count(*) from (select 1 from ftsonly limit 20) z) < 20 and sd.title % p.eff_q');
    // The old ungated admission must not come back.
    expect(hybrid).not.toMatch(/sd\.search_tsv @@ websearch_to_tsquery\('simple',unaccent\(p\.eff_q\)\) or sd\.title % p\.eff_q/);
  });

  it('kw_hit means "admitted by the keyword arm"', () => {
    expect(hybrid).toContain('case when sd.doc_id in (select doc_id from kwonly) then 1 else 0 end kw_hit');
  });

  it('fetches keyword candidates by doc_id, not by a full-table OR filter', () => {
    expect(hybrid).toContain('where (select eff_q from p2) is not null and sd.doc_id in (select doc_id from kwvec)');
    expect(hybrid).toContain('from base sd cross join p2 p left join vnn');
  });

  it('detects cities through query n-grams against the expression index', () => {
    expect(sql).toMatch(/create index if not exists search_documents_city_title_unaccent\s+on public\.search_documents \(lower\(public\.immutable_unaccent\(title\)\)\)\s+where entity_type = 'city'/);
    expect(hybrid).toContain("lower(public.immutable_unaccent(c.title)) = any(qng.ng)");
  });

  it('scores a bare place query against the original query', () => {
    expect(hybrid).toContain('lower(unaccent(coalesce(p.eff_q,p.q0))) then 1 else 0 end exact_title');
    expect(hybrid).toContain('case when f.exact_title=1 and f.is_major then 0.01 else 0 end');
  });

  it('applies the same gate to search_facets', () => {
    expect(facets).toContain('(select count(*) from (select 1 from fts limit 20) z) < 20 and sd.title % p.q');
    expect(facets).not.toMatch(/websearch_to_tsquery\('simple', unaccent\(p\.q\)\) or sd\.title % p\.q/);
  });

  it('keeps SECURITY DEFINER and the pinned search_path', () => {
    for (const fn of [hybrid, facets]) {
      expect(fn).toContain('STABLE SECURITY DEFINER');
      expect(fn).toContain("SET search_path TO 'public', 'extensions', 'pg_temp'");
    }
  });
});
