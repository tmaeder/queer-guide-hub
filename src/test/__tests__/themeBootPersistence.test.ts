import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Dark mode came back on 2026-08-18 (#2850), but the 2026-08-09 script that
 * removed it stayed in index.html: on every load it stripped `dark`, forced
 * `light` and deleted `ui-theme`, so a reader who chose Dark lost it on the
 * next page. It also lacked `data-cfasync="false"`, so Rocket Loader could run
 * it after paint — a dark→light swap mid-render.
 *
 * This runs every inline <script> in index.html that touches the theme, in
 * document order, against a stored preference, and asserts the preference
 * survives. Checking for one string would pass a reworded version of the bug.
 */
const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');

const themeScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .filter((body) => /ui-theme|documentElement\.classList/.test(body));

function boot(stored: string | null) {
  document.documentElement.className = '';
  localStorage.clear();
  if (stored) localStorage.setItem('ui-theme', stored);
  for (const body of themeScripts) new Function(body)();
}

afterEach(() => {
  document.documentElement.className = '';
  localStorage.clear();
});

describe('index.html theme boot', () => {
  it('finds the theme boot script (positive control)', () => {
    expect(themeScripts.length).toBeGreaterThan(0);
    expect(themeScripts.some((b) => b.includes('ui-theme'))).toBe(true);
  });

  it('keeps a stored dark preference', () => {
    boot('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(localStorage.getItem('ui-theme')).toBe('dark');
  });

  it('keeps a stored light preference', () => {
    boot('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('ui-theme')).toBe('light');
  });
});
