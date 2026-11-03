import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991793669865_commons_deleted_asset_check';
const sql = readFileSync(
  resolve(__dirname, `../../../supabase/migrations/${MIGRATION}.sql`),
  'utf8',
);
// The header quotes the behaviour being asserted, so assertions run over code only.
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const body = code.slice(
  code.indexOf('create or replace function public.run_commons_deleted_asset_check'),
  code.indexOf('$function$;'),
);
const titleLoop = body.slice(
  body.indexOf('for rec in'),
  body.indexOf('select count(*) into v_answered'),
);
const flagBranch = body.slice(
  body.indexOf('if v_missing > p_max_flags then'),
  body.indexOf('return jsonb_build_object'),
);

describe('run_commons_deleted_asset_check', () => {
  it('only reads active assets', () => {
    expect(body).toMatch(/where ia\.status = 'active'/);
  });

  it('flags only assets the API reported missing', () => {
    expect(body).toMatch(/join _cdac_seen s on s\.wiki = a\.wiki and s\.missing/);
  });

  it('counts a failed request as a failure and records nothing from it', () => {
    expect(titleLoop).toMatch(
      /exception when others then\s+v_chunk_failures := v_chunk_failures \+ 1;\s+continue;/,
    );
    expect(titleLoop).toMatch(
      /if r\.status <> 200 then\s+v_chunk_failures := v_chunk_failures \+ 1;\s+continue;/,
    );
    // The insert into _cdac_seen must come after both guards.
    expect(titleLoop.indexOf('insert into _cdac_seen')).toBeGreaterThan(
      titleLoop.indexOf('if r.status <> 200'),
    );
  });

  it('refuses to flag anything when too many files come back missing', () => {
    expect(flagBranch).toMatch(
      /^if v_missing > p_max_flags then\s+v_refused := true;\s+elsif not p_dry_run then/,
    );
    expect(body).toMatch(/p_max_flags < 1 or p_max_flags > 1000 then\s+raise exception/);
  });

  it('writes nothing in dry-run mode', () => {
    expect(body.match(/update public\.image_assets/g)?.length).toBe(1);
    expect(flagBranch).toContain('update public.image_assets');
    expect(flagBranch).toMatch(/elsif not p_dry_run then/);
  });

  it('only changes assets that are still active, and records why', () => {
    expect(flagBranch).toMatch(/set status = 'flagged',\s+flagged_reason =/);
    expect(flagBranch).toMatch(/where id = rec\.id and status = 'active'/);
  });

  it('identifies itself without a personal email address', () => {
    expect(body.match(/'User-Agent', '([^']+)'/g)?.length).toBe(2);
    expect(body).not.toMatch(/'User-Agent', '[^']*@/);
  });

  it('maps normalized titles back so coverage is exact', () => {
    expect(body.match(/coalesce\(\(select n\.t from _cdac_norm n/g)?.length).toBe(2);
  });

  it('is scheduled monthly, registered, and not callable by anon or authenticated', () => {
    expect(code).toMatch(/'17 4 3 \* \*'/);
    expect(code).toMatch(/'commons_deleted_asset_check',\s+'commons_deleted_asset_check'/);
    expect(code).toMatch(
      /revoke all on function public\.run_commons_deleted_asset_check\(boolean, integer\) from public, anon, authenticated;/,
    );
    expect(code).not.toMatch(
      /grant execute on function public\.run_commons_deleted_asset_check[^;]*(anon|authenticated)/,
    );
  });
});
