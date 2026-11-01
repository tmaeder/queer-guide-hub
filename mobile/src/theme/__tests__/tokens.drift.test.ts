import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dark, hsl, light, TOKEN_NAMES } from '../tokens';

/**
 * The native palette must equal the web's. Reads the real stylesheet rather
 * than a fixture, so editing either side without the other fails here.
 */
const css = readFileSync(join(__dirname, '../../../../src/index.css'), 'utf8');

/** Top-level declarations of one selector block, e.g. `:root {` or `.dark {`. */
function block(selector: string): Record<string, string> {
  const start = css.search(new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{`, 'm'));
  if (start < 0) throw new Error(`selector ${selector} not found in src/index.css`);
  let depth = 0;
  let end = start;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*--([a-z0-9-]+):\s*([^;]+);/gm)) {
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}

describe('design tokens mirror src/index.css', () => {
  const root = block(':root');
  const darkBlock = block('.dark');

  it('finds the web blocks at all (positive control)', () => {
    // An empty parse would make every comparison below vacuous.
    expect(Object.keys(root).length).toBeGreaterThan(20);
    expect(Object.keys(darkBlock).length).toBeGreaterThan(10);
  });

  it.each(TOKEN_NAMES)('light --%s', (name) => {
    expect(light[name]).toBe(root[name]);
  });

  it.each(TOKEN_NAMES)('dark --%s', (name) => {
    expect(dark[name]).toBe(darkBlock[name]);
  });

  it('formats channels as an RN/MapLibre colour string', () => {
    expect(hsl('60 33% 97%')).toBe('hsl(60, 33%, 97%)');
    expect(hsl('0 0% 6.7%', 0.5)).toBe('hsla(0, 0%, 6.7%, 0.5)');
  });
});
