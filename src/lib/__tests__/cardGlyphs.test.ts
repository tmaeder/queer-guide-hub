import { describe, expect, it } from 'vitest';
import { TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';
import { HOTEL_GLYPH_MAP, hotelGlyph, personGlyph } from '@/lib/cardGlyphs';

describe('card glyphs', () => {
  it('maps every hotel type to a real icon', () => {
    for (const t of Object.keys(HOTEL_GLYPH_MAP)) {
      expect(TRANSIT_ICON_PATHS[hotelGlyph(t)], t).toBeTruthy();
    }
    expect(hotelGlyph(null)).toBe('housing');
  });

  it('maps professions by keyword to real icons', () => {
    const cases: Array<[string | null, string]> = [
      ['Drag Queen', 'wig'],
      ['drag king', 'wig'],
      ['activist', 'march'],
      ['singer-songwriter', 'mic'],
      ['writer', 'library'],
      ['athlete', 'gym'],
      ['adult performer', 'profile'],
      [null, 'profile'],
    ];
    for (const [p, g] of cases) {
      expect(personGlyph(p), String(p)).toBe(g);
      expect(TRANSIT_ICON_PATHS[personGlyph(p)]).toBeTruthy();
    }
  });
});
