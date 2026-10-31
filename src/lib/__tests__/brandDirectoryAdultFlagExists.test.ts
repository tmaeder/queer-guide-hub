import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * get_marketplace_brand_directory() must answer `adult_only` with EXISTS
 * probes, never by aggregating every listing of every brand.
 *
 * The bool_or form read ~54k listing rows per call (2.5 s cold) and the anon
 * role's statement_timeout is 3s, so /marketplace/brands answered HTTP 500
 * under load (2026-10-31). The guard reads the LATEST migration that defines
 * the function, so a later rewrite is checked rather than this one only.
 */
const DIR = join(process.cwd(), 'supabase/migrations');

function latestDefinition(): { file: string; body: string } {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(DIR, files[i]), 'utf8');
    const m = sql.match(
      /create\s+(?:or\s+replace\s+)?function\s+public\.get_marketplace_brand_directory\(\)[\s\S]*?\$function\$([\s\S]*?)\$function\$/i,
    );
    if (m) return { file: files[i], body: m[1] };
  }
  throw new Error('no migration defines get_marketplace_brand_directory()');
}

describe('get_marketplace_brand_directory adult_only flag', () => {
  const { body } = latestDefinition();

  it('does not aggregate over every listing of a brand', () => {
    expect(body).not.toMatch(/bool_or\s*\(/i);
  });

  it('answers both halves with EXISTS probes on content_rating', () => {
    expect(body).toMatch(
      /EXISTS\s*\([\s\S]*?content_rating\s+IN\s*\(\s*'adult'\s*,\s*'explicit'\s*\)/i,
    );
    expect(body).toMatch(
      /NOT\s+EXISTS\s*\([\s\S]*?content_rating\s+IN\s*\(\s*'sfw'\s*,\s*'suggestive'\s*\)/i,
    );
  });

  it('has the (brand_key, content_rating) index the probes rely on', () => {
    const all = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(DIR, f), 'utf8'))
      .join('\n');
    expect(all).toMatch(
      /create\s+index[^;]*idx_marketplace_listings_brand_rating[^;]*\(\s*brand_key\s*,\s*content_rating\s*\)/i,
    );
  });
});
