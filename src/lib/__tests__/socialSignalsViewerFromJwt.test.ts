import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase/migrations');

/** Body of the LATEST migration that (re)defines the given function. */
function latestBody(fn: string): { file: string; body: string } {
  const re = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+api_private\\.${fn}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'i',
  );
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files.reverse()) {
    const sql = readFileSync(join(DIR, file), 'utf8').replace(/^\s*--.*$/gm, '');
    const m = sql.match(re);
    if (m) return { file, body: m[1] };
  }
  throw new Error(`no migration defines api_private.${fn}`);
}

describe.each(['get_venue_social_signals', 'get_event_social_signals'])('api_private.%s', (fn) => {
  it('takes the viewer from the JWT, never from the caller-supplied p_viewer_id', () => {
    const { file, body } = latestBody(fn);
    // positive control: the body we found is the real query, not an empty match
    expect(body, file).toMatch(/from\s+unnest\(/i);
    expect(body, file).toContain('auth.uid()');
    expect(body, file).not.toMatch(/p_viewer_id/);
  });
});
