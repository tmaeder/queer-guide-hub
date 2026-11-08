import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Two rate limits that a caller could sidestep or turn on someone else.
// Both checks read comment-stripped source, because each file's header quotes
// the vulnerable shape it replaced.

const root = resolve(__dirname, '../../..');
const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*(--|\/\/).*$/, ''))
    .join('\n');

describe('generate-usernames requires a signed-in user', () => {
  const src = stripComments(
    readFileSync(resolve(root, 'supabase/functions/generate-usernames/index.ts'), 'utf8'),
  );

  it('verifies the token before the per-user limit, which waves anonymous callers through', () => {
    const verify = src.indexOf('auth.getUser(token)');
    const limit = src.indexOf("checkUserRateLimit(req, 'generate-usernames'");
    const llm = src.indexOf('await generateBatch()');
    expect(verify).toBeGreaterThan(-1);
    expect(limit).toBeGreaterThan(verify);
    expect(llm).toBeGreaterThan(limit);
  });

  it('answers 401 when there is no user', () => {
    expect(src).toMatch(/if \(!userData\?\.user\) \{\s*return new Response\(JSON\.stringify\(\{ error: 'Sign in required' \}\), \{ status: 401/);
  });
});

describe('check_rate_limit_enhanced keys signed-in callers on themselves', () => {
  const sql = stripComments(
    readFileSync(
      resolve(root, 'supabase/migrations/99991794126367_rate_limit_wrapper_keys_on_caller.sql'),
      'utf8',
    ),
  );
  const fn = sql.slice(0, sql.indexOf('DO $verify$'));

  it('replaces the identifier for the authenticated role', () => {
    expect(fn).toMatch(
      /WHEN current_user = 'authenticated'\s+THEN 'user:' \|\| COALESCE\(auth\.uid\(\)::text, 'unknown'\)\s+ELSE \$1/,
    );
  });

  it('stays SECURITY INVOKER, so current_user is the calling role', () => {
    expect(fn).not.toMatch(/SECURITY DEFINER/i);
  });

  it('proves the fix by calling it as a signed-in user who names another key', () => {
    const verify = sql.slice(sql.indexOf('DO $verify$'));
    expect(verify).toContain('SET LOCAL ROLE authenticated');
    expect(verify).toMatch(/IF victim_rows <> 0 THEN\s+RAISE EXCEPTION/);
    expect(verify).toMatch(/IF own_rows <> 1 THEN\s+RAISE EXCEPTION/);
  });
});
