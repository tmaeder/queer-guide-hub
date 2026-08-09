import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The blank-page boot guard exists as TWO copies that MUST stay in sync:
 *
 *  - the classic inline <script> in index.html (protects documents built
 *    after the guard landed), and
 *  - BOOT_GUARD_JS in functions/_lib/boot-guard.ts (injected by the Pages
 *    middleware into every HTML response, which is the only thing that can
 *    reach a stale document predating the guard).
 *
 * A fix applied to one copy but not the other silently leaves half the
 * failure surface unprotected, so this test pins them byte-identical modulo
 * whitespace, plus the properties each deployment layer depends on.
 */

const ROOT = path.resolve(__dirname, '../../..');

function inlineGuardBody(): string {
  // indexOf-based extraction, deliberately regex-free: tag-matching regexes
  // here trip CodeQL's sanitizer heuristics (js/bad-tag-filter), and the
  // guard's own HTML doc comment mentions the literal tag, which a naive
  // match would start inside. The sentinel ASSIGNMENT only exists in code,
  // so anchoring on it lands inside the real script block.
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const marker = html.indexOf('window.__qgBootGuard = 2');
  if (marker === -1) throw new Error('index.html: boot guard sentinel assignment not found');
  const open = html.lastIndexOf('<' + 'script>', marker);
  const close = html.indexOf('</' + 'script>', marker);
  if (open === -1 || close === -1) {
    throw new Error('index.html: inline boot guard <script> block not found');
  }
  return html.slice(open + '<script>'.length, close);
}

function injectedGuardBody(): string {
  const src = readFileSync(path.join(ROOT, 'functions/_lib/boot-guard.ts'), 'utf8');
  const m = src.match(/BOOT_GUARD_JS = `([\s\S]*?)`;/);
  if (!m) throw new Error('boot-guard.ts: BOOT_GUARD_JS template literal not found');
  return m[1];
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('boot guard copies', () => {
  it('index.html and boot-guard.ts carry the same guard body', () => {
    expect(collapse(inlineGuardBody())).toBe(collapse(injectedGuardBody()));
  });

  it('keeps the load-bearing behaviors both layers rely on', () => {
    for (const body of [inlineGuardBody(), injectedGuardBody()]) {
      // scripts/check-pages-routing.mjs fails the build on this marker.
      expect(body).toContain('preload-error-reload');
      // Mutual-exclusion sentinel with the middleware-injected copy.
      expect(body).toContain('__qgBootGuard');
      // Document recovery: fresh cache key, not a bare reload.
      expect(body).toContain('__fresh');
      // Browser-HTTP-cache heal: per-URL rewrite of poisoned entries
      // (immutable-cached 404/HTML from a deploy window) BEFORE the reload.
      expect(body).toMatch(/cache:\s*'reload'/);
      expect(body).toContain("getEntriesByType('resource')");
      // Poisoned stylesheets blank the page too (unstyled Times-font shell).
      expect(body).toContain("rel === 'stylesheet'");
    }
  });

  it('stays injectable and runnable in ancient webviews', () => {
    const body = injectedGuardBody();
    // A literal </script> would terminate the injected tag mid-body.
    expect(body).not.toContain('</script');
    // The template literal must not interpolate, and the guard must stay ES5
    // (it is the last line of defense on browsers old enough to choke on
    // anything newer).
    expect(body).not.toContain('${');
    expect(body).not.toMatch(/=>|\bconst\b|\blet\b/);
  });
});
