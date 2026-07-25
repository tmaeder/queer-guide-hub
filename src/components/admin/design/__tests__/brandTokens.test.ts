import { describe, it, expect } from 'vitest';
import { resolveTokens, tokensToCss, tokensToJson } from '../../../../../functions/_lib/brandTokens';
import { COLOR_TOKENS, GLOBAL_TOKENS } from '../tokenCatalog';

describe('brand token API composer', () => {
  it('resolves compiled-in defaults when there are no overrides', () => {
    const r = resolveTokens(null);
    // Every catalog token is present with its default in both modes.
    for (const t of COLOR_TOKENS) {
      expect(r.color.light[t.key]).toBe(t.light);
      expect(r.color.dark[t.key]).toBe(t.dark);
    }
    for (const g of GLOBAL_TOKENS) {
      expect(r.global[g.key]).toBe(g.default);
    }
  });

  it('overlays published overrides on top of defaults, leaving others untouched', () => {
    const r = resolveTokens({
      tokens: {
        light: { background: '0 0% 50%' },
        global: { 'radius-container': '2rem' },
      },
    });
    expect(r.color.light.background).toBe('0 0% 50%'); // overridden
    expect(r.color.dark.background).toBe(
      COLOR_TOKENS.find((t) => t.key === 'background')!.dark,
    ); // untouched
    expect(r.global['radius-container']).toBe('2rem'); // overridden
    expect(r.global['radius-element']).toBe(
      GLOBAL_TOKENS.find((g) => g.key === 'radius-element')!.default,
    ); // untouched
  });

  it('renders a :root + .dark stylesheet', () => {
    const css = tokensToCss(resolveTokens(null));
    expect(css).toContain(':root {');
    expect(css).toContain('.dark {');
    expect(css).toContain('--background: 0 0% 100%;');
    expect(css).toContain('--radius-container: 1rem;');
  });

  it('produces structured JSON with color + global sections', () => {
    const json = tokensToJson(resolveTokens(null));
    expect(json.color.light).toBeTruthy();
    expect(json.color.dark).toBeTruthy();
    expect(json.global['radius-badge']).toBe('0.25rem');
  });
});
