// Guards source-may17 and the observance source-signal patch (99991795363706).
// Text over COMMENT-STRIPPED sources: the headers quote the rules they implement.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--') && !l.trimStart().startsWith('//'))
    .join('\n');
const dir = join(process.cwd(), 'supabase/migrations');
const file = readdirSync(dir).find((f) =>
  f.endsWith('_may17_source_and_observance_source_signal.sql'),
)!;
const sql = strip(readFileSync(join(dir, file), 'utf8'));
const fn = strip(
  readFileSync(join(process.cwd(), 'supabase/functions/source-may17/index.ts'), 'utf8'),
);

describe('observance source signal', () => {
  it('patches the live linker with exactly-once anchors, never restates it', () => {
    expect(sql).toMatch(
      /pg_get_functiondef\('public\.run_observance_link\(text,timestamptz\)'::regprocedure\)/,
    );
    expect(sql).toMatch(/anchor % not found exactly once/);
    expect(sql).not.toMatch(/create or replace function public\.run_observance_link/i);
  });

  it('a listed source is a name signal in the join AND in the title term', () => {
    expect(sql).toMatch(
      /or \(cardinality\(o\.src\) > 0 and exists \(select 1 from public\.event_sources es/,
    );
    expect(sql).toMatch(/\(select ''source:'' \|\| es\.source_slug from public\.event_sources es/);
  });

  it('the patch does not touch the auto-link decision (date window still required)', () => {
    const patch = sql.slice(sql.indexOf('do $patch$'), sql.indexOf('$patch$;'));
    expect(patch).not.toMatch(/date_sig/);
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(/s\.title_term is not null and s\.date_sig then ''linked''/);
  });

  it('only IDAHOBIT lists may17', () => {
    expect(sql).toMatch(
      /update public\.observances set source_slugs = array\['may17'\] where slug = 'idahobit';/,
    );
  });

  it('registers a plain (unwrapped) cron command', () => {
    expect(sql).toMatch(/'ev_fill_may17'/);
    const cmd = sql.slice(sql.indexOf("'command',"), sql.indexOf("'50 2 * * *'"));
    expect(cmd).toMatch(/net\.http_post\(/);
    expect(cmd).not.toMatch(/automation_http_post|admin_automation_run_begin/);
  });
});

describe('source-may17', () => {
  it('never stages the API venue record as a venue name', () => {
    expect(fn).toMatch(/venue_name: undefined,/);
    expect(fn).not.toMatch(/venue_name: e\./);
  });

  it('stages under the slug the observance lists', () => {
    expect(fn).toMatch(/sourceName: 'may17',/);
  });

  it('is reachable by the cron (verify_jwt off)', () => {
    const toml = readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf8');
    expect(toml).toMatch(/\[functions\.source-may17\]\nverify_jwt = false/);
  });
});
