import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The edge 404 (`notFoundHtml` in functions/_middleware.ts) is a standalone
 * document with no access to the Tailwind theme, so it restates the design
 * tokens inline — and `functions/_middleware.ts` is in ESLint's `ignores`
 * list, so none of the design rules that guard `src/**` apply to it.
 *
 * Hand-copied colours going stale is a recurring failure in this repo
 * (CLAUDE.md records a documented `--ink-blue` that was 30° off the real
 * token). This test is the guard: the edge document declares its colours as
 * HSL channel TRIPLES so they can be compared literally against `:root` in
 * src/index.css, and any token edit that forgets the edge copy fails here
 * instead of shipping a 404 in last season's palette.
 *
 * It lives under `src/` on purpose — vitest's include glob is `src/**`, so a
 * test placed next to the file it checks would never run (the same trap that
 * hid 38 of the 45 edge-function test files).
 */

const ROOT = path.resolve(__dirname, '../../..');
const CSS = readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
const MIDDLEWARE = readFileSync(path.join(ROOT, 'functions/_middleware.ts'), 'utf8');

/** Read a `--name: <triple>;` declaration out of the `:root` block. */
function token(name: string): string {
  const root = CSS.slice(CSS.indexOf(':root {'));
  const m = root.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`src/index.css: --${name} not found in :root`);
  return m[1].trim();
}

/** The edge document's own `:root` line, e.g. `--paper: 60 33% 97%`. */
function edgeToken(name: string): string {
  const m = MIDDLEWARE.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`functions/_middleware.ts: --${name} not declared in notFoundHtml`);
  return m[1].trim();
}

describe('edge 404 design tokens', () => {
  it.each([
    ['paper', 'background'],
    ['ink', 'foreground'],
    ['muted', 'muted-foreground'],
  ])('--%s matches --%s in src/index.css', (edgeName, cssName) => {
    expect(edgeToken(edgeName)).toBe(token(cssName));
  });

  it('every track colour used by a kind is a real --track-* token', () => {
    const declared = new Set(
      ['track-pink', 'track-blue', 'track-green', 'track-yellow'].map((n) => token(n)),
    );
    // `track: '330 100% 56%',` entries in NOT_FOUND_KINDS.
    const used = [...MIDDLEWARE.matchAll(/track:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const value of used) expect(declared).toContain(value);
  });

  it('carries no dark-mode leftovers', () => {
    const html = MIDDLEWARE.slice(MIDDLEWARE.indexOf('function notFoundHtml'));
    // The page was a dark #0a0a0a document until the subway-map rebrand; the
    // brand is light-only, so any hex here is both off-system and unguarded.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
