import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Kink & feature filters, migration 1 (99991795359027). The registry serves
 * sensitive tags to anon through SECURITY DEFINER functions, so the guards that
 * matter are the ones that keep that path narrow: registry rows only, safety-
 * gated rows hidden from anon, and a sync that never deletes a non-registry tag.
 */

const FILE = join(process.cwd(), 'supabase/migrations/99991795359027_kink_filter_terms.sql');

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

const sql = stripComments(readFileSync(FILE, 'utf8'));

/** Body of `create or replace function public.<name>` up to its closing `$fn$;`. */
function fnBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const end = sql.indexOf('$fn$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('kink filter registry migration', () => {
  it('declares an actor before touching human_reviewed tags', () => {
    const actor = sql.indexOf(
      "set_config('app.actor', 'migration:99991795359027_kink_filter_terms'",
    );
    const firstInsert = sql.indexOf('insert into public.unified_tags');
    expect(actor).toBeGreaterThan(-1);
    expect(actor).toBeLessThan(firstInsert);
  });

  it('read functions serve registry rows only', () => {
    for (const name of ['kink_filter_terms_list', 'kink_filter_term']) {
      const body = fnBody(name);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = ''/);
      expect(body).toMatch(
        /from public\.kink_filter_terms k\s+join public\.unified_tags t on t\.id = k\.tag_id/,
      );
      expect(body).toMatch(
        /where k\.enabled and t\.status = 'active' and t\.merged_into_id is null/,
      );
    }
  });

  it('counts hide safety-gated events and venues from anon', () => {
    const body = fnBody('kink_filter_terms_list');
    expect(body).toMatch(/\(not e\.safety_gated or \(select auth\.uid\(\)\) is not null\)/);
    expect(body).toMatch(/\(not v\.safety_gated or \(select auth\.uid\(\)\) is not null\)/);
    expect(body).toMatch(/e\.duplicate_of_id is null/);
    expect(body).toMatch(/v\.duplicate_of_id is null/);
  });

  it('sync deletes only registry slugs that left the array', () => {
    const body = fnBody('kink_tags_sync_assignments');
    const del = body.slice(body.indexOf('delete from public.unified_tag_assignments'));
    expect(del).toMatch(/using public\.kink_filter_terms k/);
    expect(del).toMatch(/t\.slug = any\(v_old\)/);
    expect(del).toMatch(/not \(t\.slug = any\(v_new\)\)/);
  });

  it('the registry table is not granted to anon or authenticated', () => {
    expect(sql).toMatch(/revoke all on public\.kink_filter_terms from anon, authenticated;/);
    expect(sql).not.toMatch(/grant [a-z, ]+ on (table )?public\.kink_filter_terms to/i);
  });

  it('every postcondition raises', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']) {
      expect(verify).toMatch(new RegExp(`raise exception '${p} failed`));
    }
    expect(verify).not.toMatch(/where false|if \(false\)/);
  });

  it('the tag-page patch changes exactly one ORDER BY, from the live definition', () => {
    const patch = sql.slice(sql.indexOf('do $patch$'), sql.indexOf('$patch$;'));
    expect(patch).toMatch(/pg_get_functiondef\('public\.get_tag_linked_content/);
    expect(patch).toMatch(/if v_n <> 1 then\s+raise exception/);
  });
});
