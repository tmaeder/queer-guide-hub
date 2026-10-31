import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991793469430_image_asset_claim_reaper';
const sql = readFileSync(
  resolve(__dirname, `../../../supabase/migrations/${MIGRATION}.sql`),
  'utf8',
);
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const body = code.slice(
  code.indexOf('create or replace function public.run_image_asset_claim_reaper'),
  code.indexOf('$function$;'),
);
const staleCte = body.slice(body.indexOf('with stale as'), body.indexOf('released as'));
const updateCte = body.slice(body.indexOf('released as'), body.indexOf('returning'));

describe('run_image_asset_claim_reaper', () => {
  it('only touches rows that are still processing', () => {
    expect(staleCte).toMatch(/where ia\.optimization_status = 'processing'/);
  });

  it('ages a claim by both claim stamps, falling back to updated_at', () => {
    for (const key of ['processing_started_at', 'venue_metadata_started_at']) {
      expect(staleCte.match(new RegExp(`'${key}'`, 'g'))?.length).toBe(2);
    }
    expect(staleCte).toMatch(/\)\s*,\s*ia\.updated_at\s*\)\s*<\s*now\(\) - p_stale_after/);
  });

  it('refuses a stale window short enough to steal a live claim', () => {
    expect(body).toMatch(/p_stale_after < interval '15 minutes' then\s+raise exception/);
    expect(body).toMatch(/errcode = '22023'/);
  });

  it('is batched, capped, and skips rows another worker holds', () => {
    expect(staleCte).toMatch(/limit greatest\(1, least\(coalesce\(p_batch, 200\), 500\)\)/);
    expect(staleCte).toMatch(/for update of ia skip locked/);
  });

  it('cannot loop: the third release is terminal, not pending', () => {
    expect(updateCte).toMatch(
      /optimization_status = case when s\.reaps \+ 1 >= 3 then 'failed' else 'pending' end/,
    );
    expect(updateCte).toMatch(/'claim_reap_count', s\.reaps \+ 1/);
    expect(updateCte).toMatch(/'last_failure_reason', 'claim_abandoned'/);
    expect(updateCte).toMatch(/'terminal', true/);
  });

  it('is service_role only', () => {
    expect(code).toMatch(
      /revoke all on function public\.run_image_asset_claim_reaper\(interval, integer\) from public, anon, authenticated;/,
    );
    expect(code).toMatch(
      /grant execute on function public\.run_image_asset_claim_reaper\(interval, integer\) to service_role;/,
    );
  });

  it('is registered and scheduled through the automation registry', () => {
    expect(code).toMatch(/'command', 'select public\.run_image_asset_claim_reaper\(\);'/);
    expect(code).toMatch(
      /public\.admin_automation_effective_command\(\s*'image_asset_claim_reaper'/,
    );
  });

  it('verifies the schedule, the grants and the short-window guard', () => {
    const verify = code.slice(code.indexOf('do $verify$'));
    for (const p of ['P1 failed', 'P2 failed', 'P3 failed']) {
      expect(verify).toContain(p);
    }
    expect(verify).toMatch(/exception when sqlstate '22023' then\s+null;/);
  });
});
