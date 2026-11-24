import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991795523119_intimate_discovery_join_user_id.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
// The header quotes the broken join verbatim; assert against code only.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const view = sql.slice(sql.indexOf('create or replace view'), sql.indexOf('do $patch$'));
const patch = sql.slice(sql.indexOf('do $patch$'), sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('intimate discovery joins profiles on user_id', () => {
  it('the view joins on profiles.user_id and keeps security_invoker', () => {
    expect(view).toContain('join public.profiles p on p.user_id = ip.id');
    expect(view).not.toContain('p.id = ip.id');
    expect(view).toContain('security_invoker = on');
  });

  it('the RPC patch rewrites the join and casts height_cm, then executes', () => {
    expect(patch).toContain("'join public.profiles p on p.user_id = ip.id'");
    expect(patch).toContain("'    ip.height_cm::integer,'");
    expect(patch).toMatch(/execute v_src;/);
  });

  it('the postconditions raise on the old join, the cast, invoker and anon', () => {
    expect(verify.match(/raise exception/g)?.length).toBe(5);
    expect(verify).toContain("position('p.id = ip.id' in v_src) > 0");
    expect(verify).toContain("has_table_privilege('anon'");
  });
});
