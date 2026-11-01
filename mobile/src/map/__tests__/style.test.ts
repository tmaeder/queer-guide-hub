import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapStyle, TILE_URL } from '../style';

const webStyleSource = readFileSync(
  join(__dirname, '../../../../src/config/mapStyle.ts'),
  'utf8',
);

/** Every string value anywhere under a paint object. */
function paintColours(style: ReturnType<typeof mapStyle>): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string' && /^(hsl|hsla|rgb|rgba|#)/.test(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const l of style.layers) walk((l as { paint?: unknown }).paint);
  return out;
}

describe.each(['light', 'dark'] as const)('mapStyle(%s)', (scheme) => {
  const style = mapStyle(scheme);

  it('builds a non-trivial style (positive control)', () => {
    expect(style.layers.length).toBeGreaterThan(50);
    expect(paintColours(style).length).toBeGreaterThan(50);
  });

  it('emits only comma-syntax hsl colours MapLibre Native can parse', () => {
    for (const c of paintColours(style)) {
      expect(c).toMatch(/^hsla?\(\s*[\d.]+,\s*[\d.]+%,\s*[\d.]+%(,\s*[\d.]+)?\)$/);
    }
  });

  it('drops the POI layer and every non-bridge road casing', () => {
    const ids = style.layers.map((l) => l.id);
    expect(ids).not.toContain('pois');
    const casings = ids.filter((id) => id.startsWith('roads') && id.includes('_casing'));
    expect(casings.length).toBeGreaterThan(0);
    expect(casings.every((id) => id.includes('bridges'))).toBe(true);
  });
});

it('uses the same tile Worker as the web basemap', () => {
  const m = webStyleSource.match(/export const TILE_URL\s*=\s*'([^']+)'/);
  expect(m?.[1]).toBe(TILE_URL);
});

it('light and dark differ (dark mode is real)', () => {
  expect(mapStyle('light').layers.find((l) => l.id === 'background')).not.toEqual(
    mapStyle('dark').layers.find((l) => l.id === 'background'),
  );
});
