import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The database-block core modules are imported from BOTH `src/` (through the
 * `@/` alias) and `functions/_lib/` (through a relative `../../src/...` path —
 * the `functions/_lib/brandTokens.ts` precedent).
 *
 * The Cloudflare Pages bundle configures no `@/` alias and cannot resolve app
 * dependencies, so a single aliased or bare-package import here breaks the edge
 * build. Nothing typechecks `functions/`, and `_middleware.ts` is ESLint-ignored,
 * so that break would ship green and fail at request time in production.
 *
 * This test is the enforcement.
 */

const DIR = join(__dirname, '..');

/** Modules that must stay importable from the Cloudflare Pages bundle. */
const PORTABLE_MODULES = ['schema.ts', 'parse.ts', 'query.ts', 'normalize.ts'];

function portableFiles(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .filter((f) => PORTABLE_MODULES.includes(f));
}

/** Matches the specifier of any static import or re-export. */
const IMPORT_RE = /^\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/gm;
/** Bare `import 'x'` side-effect form. */
const SIDE_EFFECT_RE = /^\s*import\s+['"]([^'"]+)['"]/gm;

describe('databaseBlock portable modules', () => {
  it('covers every portable module that exists', () => {
    const found = portableFiles();
    expect(found.length).toBeGreaterThan(0);
    // schema.ts is the foundation; it must always be present.
    expect(found).toContain('schema.ts');
  });

  for (const file of portableFiles()) {
    it(`${file} has no aliased or bare-package imports`, () => {
      const src = readFileSync(join(DIR, file), 'utf8');
      const specifiers: string[] = [];
      for (const m of src.matchAll(IMPORT_RE)) specifiers.push(m[1]);
      for (const m of src.matchAll(SIDE_EFFECT_RE)) specifiers.push(m[1]);

      for (const spec of specifiers) {
        expect(
          spec.startsWith('./') || spec.startsWith('../'),
          `${file} imports "${spec}" — portable modules may only use relative ` +
            `imports. The Cloudflare Pages bundle has no "@/" alias and no ` +
            `access to node_modules for these files.`,
        ).toBe(true);
      }
    });
  }

  it('schema.ts has no imports at all', () => {
    const src = readFileSync(join(DIR, 'schema.ts'), 'utf8');
    // Fresh non-global regexes: `.test()` on a /g regex advances lastIndex,
    // which would make these assertions depend on execution order.
    expect(/^\s*(?:import|export)\s[^;]*?\sfrom\s+['"]/m.test(src)).toBe(false);
    expect(/^\s*import\s+['"]/m.test(src)).toBe(false);
  });
});
