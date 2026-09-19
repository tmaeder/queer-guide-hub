import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99950101100100_birth_place_shell_country_pass.sql';
const raw = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');

/**
 * The header narrates the defects verbatim, so a `toContain` over the whole file passes
 * against a gutted statement. Everything below runs over comment-stripped source.
 */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const verifyBlock = (() => {
  const m = statements.match(/do \$verify\$([\s\S]*?)\$verify\$/);
  if (!m) throw new Error('verify block not found');
  return m[1];
})();

describe('birth-place shell country pass', () => {
  it('reparents the three Puerto Rico shells and nothing else', () => {
    const stmt = statements.match(/update cities c\s*\n\s*set country_id[\s\S]*?;/)?.[0] ?? '';
    expect(stmt).toContain('08d9303b-2a19-4c6f-874e-fab9be86f67b'); // Carolina
    expect(stmt).toContain('47dff25b-2fd2-4f76-92f4-06aa6a762a49'); // Cayey
    expect(stmt).toContain('47843f6d-4015-475a-b66f-e749f716dbe4'); // San Juan
    expect(stmt).toMatch(/code\s*=\s*'PR'/);
    // it must be guarded on the row still being filed US, so it is a no-op if already fixed
    expect(stmt).toMatch(/c\.country_id\s*=\s*\(select id from countries where code\s*=\s*'US'\)/);
  });

  it('archives the two non-places reversibly rather than deleting them', () => {
    expect(statements).toContain('archive_city_as_nonplace');
    expect(statements).not.toMatch(/delete\s+from\s+cities/i);
    // each carries the live-resolved identifier that justified the call
    expect(statements).toContain('Q1644904'); // Rio Grande Valley, a region
    expect(statements).toContain('Q153963'); // German East Africa, a defunct polity
  });

  it('fixes ONLY Lippen’s coordinates and leaves its country alone', () => {
    // The probe measures "coordinates disagree with country"; here the coordinates are the
    // wrong side. Q160661 is a settlement IN GERMANY, which agrees with the stored country.
    const stmt = statements.match(/update cities c\s*\n\s*set latitude[\s\S]*?;/)?.[0] ?? '';
    expect(stmt).toContain('Q160661');
    expect(stmt).toContain('51.37920');
    expect(stmt).not.toContain('country_id');
    expect(verifyBlock).toMatch(/co\.code\s*=\s*'DE'/);
  });

  it('asserts the deferred convention rows are UNTOUCHED', () => {
    // Hong Kong (CN vs HK) and Saint-Denis Réunion (FR vs RE) are convention decisions the
    // corpus has not made consistently. A later sweep has to break this check first.
    expect(verifyBlock).toContain('e4aad542-deca-4301-89c6-102d963f6e4c'); // Hong Kong shell
    expect(verifyBlock).toContain('02cf5fc5-4bcb-432c-94fc-ee7a8d983574'); // Saint-Denis
    expect(verifyBlock).toMatch(/P6[\s\S]*deferred/);
    expect(verifyBlock).toMatch(/P7[\s\S]*deferred/);
  });

  it('proves archiving kept the personality link, since archiving is reversible', () => {
    expect(verifyBlock).toMatch(/personalities[\s\S]*83fa4368-90a7-4fa1-b307-9191988aa270/);
  });

  it('gates a corpus-wide invariant, not merely its own three rows', () => {
    expect(verifyBlock).toMatch(/name ilike '%, Puerto Rico'[\s\S]*?co\.code\s*=\s*'US'/);
  });

  it('cannot pass on an empty probe and has no short-circuited postcondition', () => {
    expect(verifyBlock).toMatch(/v_total\s*<\s*1000/);
    const raises = verifyBlock.match(/raise exception/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(8);
    expect(verifyBlock).not.toMatch(/where\s+false/);
    expect(verifyBlock).not.toMatch(/if\s+false/);
  });
});
