import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { contentTypeRegistry } from '@/config/contentTypes';

/**
 * `/admin/content/:type` never 404s on a bad key.
 *
 * `useContentListController` falls through to `loadAllTypes()` when the type is
 * not in the registry, so a misspelled key silently renders the "All Content"
 * list. That makes a wrong key invisible to every kind of smoke check: the page
 * returns 200, renders one `<h1>`, has no console error, and passes an axe scan
 * — of a completely different page than the one the caller asked for.
 *
 * It had already happened. `e2e/a11y-admin.spec.ts` scanned
 * `/admin/content/news` and `/admin/content/marketplace` for as long as that
 * spec existed; the registry keys are `news_articles` and
 * `marketplace_listings`, so the two lists it claimed to cover had never once
 * been scanned and the spec passed anyway.
 *
 * This scans the e2e and admin-config sources rather than asserting a list,
 * because a list would have to be kept in step with the specs by hand — which
 * is the same failure one level up.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Matches a literal `/admin/content/<key>` path, capturing the key. */
const ROUTE_RE = /\/admin\/content\/([a-z][a-z0-9_]*)/g;

/**
 * Comments are not routes.
 *
 * CI caught this the honest way: the guard failed on `e2e/a11y-admin.spec.ts:18`,
 * which is the docblock EXPLAINING the original defect and therefore quotes
 * `/admin/content/news` and `/admin/content/marketplace` as prose. A scanner that
 * reads raw file text cannot tell a route from a sentence about a route — the
 * same trap this repo hits repeatedly when a mutation lands in a header comment
 * instead of the statement.
 *
 * Blanked rather than deleted so line numbers in the failure message stay true to
 * the file.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/**
 * Keys that are legitimately not registry entries: real routes served by their
 * own component rather than by the `content/:type` wildcard.
 */
const NON_REGISTRY_ROUTES = new Set([
  'liveness', // AdminLiveness
  'event', // `content/event-quality` — hyphen stops at the capture
  'group', // `content/group-requests`
  'personalities', // also a real registry key, plus the /:id/datasheet route
]);

describe('admin /admin/content/:type route keys', () => {
  const files = [
    ...walk(join(REPO_ROOT, 'e2e')),
    ...walk(join(REPO_ROOT, 'src', 'config')),
    ...walk(join(REPO_ROOT, 'src', 'pages', 'admin')),
    // This file is excluded below: its own docblock quotes the two wrong keys
    // as the worked example, so scanning itself would never go green.
  ].filter((f) => f !== __filename);

  it('scans a non-trivial number of files (guards against a broken walk)', () => {
    // Absence of findings must not be reachable by finding no files at all.
    expect(files.length).toBeGreaterThan(50);
  });

  it('every referenced content type exists in the registry', () => {
    const known = new Set(Object.keys(contentTypeRegistry));
    const bad: string[] = [];

    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const match of src.matchAll(ROUTE_RE)) {
        const key = match[1];
        if (known.has(key) || NON_REGISTRY_ROUTES.has(key)) continue;
        const line = src.slice(0, match.index).split('\n').length;
        bad.push(`${file.replace(`${REPO_ROOT}/`, '')}:${line} → ${key}`);
      }
    }

    expect(
      bad,
      `These /admin/content/<key> references name a type that is not in contentTypeRegistry. ` +
        `The route will NOT 404 — it silently renders the "All Content" list, so a test ` +
        `referencing it passes while never visiting the intended page.\n${bad.join('\n')}`,
    ).toEqual([]);
  });

  it('ignores a route named in a comment but still catches a live one', () => {
    // Without this the guard fails on its own explanatory prose, which is how CI
    // caught it. Asserted directly so the stripper cannot be quietly removed.
    const sample = [
      '// see /admin/content/news for the old bug',
      '/* and /admin/content/marketplace too */',
      "const r = '/admin/content/bogus_key';",
    ].join('\n');
    const found = [...stripComments(sample).matchAll(ROUTE_RE)].map((m) => m[1]);
    expect(found).toEqual(['bogus_key']);
  });

  it('finds the keys it is supposed to be checking (positive control)', () => {
    // A regex that matched nothing would make the assertion above vacuous.
    const src = readFileSync(join(REPO_ROOT, 'e2e', 'a11y-admin.spec.ts'), 'utf8');
    const found = [...src.matchAll(ROUTE_RE)].map((m) => m[1]);
    expect(found).toContain('news_articles');
    expect(found).toContain('marketplace_listings');
  });
});
