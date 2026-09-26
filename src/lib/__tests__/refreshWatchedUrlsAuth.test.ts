import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('supabase/functions/refresh-watched-urls/index.ts', 'utf8');

describe('refresh-watched-urls authorization contract', () => {
  it('authenticates before reading watched URLs with the service client', () => {
    expect(source).toContain('requireInternalOrAdmin');

    const authAt = source.indexOf('await requireInternalOrAdmin(req, supabase)');
    const watchedUrlsAt = source.indexOf(".from('watched_urls')");

    expect(authAt).toBeGreaterThan(-1);
    expect(watchedUrlsAt).toBeGreaterThan(authAt);
  });
});
