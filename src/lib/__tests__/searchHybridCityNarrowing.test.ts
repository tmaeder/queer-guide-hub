import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards migration 99991794052799 (search_hybrid city narrowing + rank scaling).
 * Assertions run on comment-stripped SQL: the header quotes the rejected shapes.
 */
const MIGRATION = '99991794052799_search_hybrid_city_narrowing';
const raw = readFileSync(resolve(__dirname, `../../../supabase/migrations/${MIGRATION}.sql`), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const mig = sql.slice(sql.indexOf('do $mig$'), sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('search_hybrid city narrowing', () => {
  it('narrows only for a single lexeme the frequency table knows, at >= 500 docs', () => {
    expect(mig).toContain('p.dcity is not null and d.n_lex = 1 and d.n_found = 1 and d.df >= 500');
    // The rejected AND estimates must not come back.
    expect(mig).not.toContain('exp(sum(ln(');
    expect(mig).not.toContain('d.n_found = d.n_lex');
  });

  it('adds the city term to the FTS arm only when narrowing', () => {
    expect(mig).toContain(
      "websearch_to_tsquery(''simple'',unaccent(case when (select narrow from kwdf) then p.eff_q||chr(32)||p.dcity else p.eff_q end))),",
    );
  });

  it('limits the trigram fallback to the city only when narrowing', () => {
    expect(mig).toContain("< 20 and sd.title % p.eff_q and (not (select narrow from kwdf) or lower(sd.city)=lower(p.dcity)))");
  });

  it('scales the keyword rank by worldwide / in-city matches, and only when narrowing', () => {
    expect(mig).toContain(
      'rank() over (order by greatest(kw_rank,trg) desc) * (select case when narrow then greatest(1.0, df::numeric / greatest((select count(*) from ftsonly), 1)) else 1.0 end from kwdf) rk',
    );
  });

  it('patches the live definition with exactly-once anchors and applies every replacement', () => {
    expect(mig).toContain('pg_get_functiondef(v_oid)');
    expect(mig).toContain("if v_n <> 1 then raise exception 'anchor % found % times, expected 1'");
    expect(mig).toContain('v_def := replace(v_def, v_from[i], v_to[i]);');
    expect(mig).toContain('execute v_def;');
    expect(mig.match(/^\s*'/gm)?.length).toBe(8);
  });

  it('builds search_term_df from ts_stat at >= 200 docs and keeps it away from anon', () => {
    expect(sql).toContain("from ts_stat('select search_tsv from public.search_documents')");
    expect(sql).toContain('where ndoc >= 200;');
    expect(sql).toContain('revoke all on public.search_term_df from public, anon, authenticated;');
    expect(sql).toContain('revoke all on function public.run_search_term_df_refresh() from public, anon, authenticated;');
  });

  it('registers the nightly refresh in admin_automations and pg_cron', () => {
    expect(sql).toContain("'search_term_df_refresh',\n  '43 2 * * *',");
    expect(sql).toContain("'command', 'select public.run_search_term_df_refresh();'");
  });

  it('verify block raises on each postcondition', () => {
    for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9']) {
      expect(verify).toMatch(new RegExp(`then raise exception '${p} failed`));
    }
    expect(verify).toContain("position('d.n_lex = 1 and d.n_found = 1 and d.df >= 500' in v_src) = 0");
  });
});
