import { describe, expect, it } from 'vitest';
import { TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';
import {
  contentTypeGlyph,
  cityGlyph,
  HOTEL_GLYPH_MAP,
  NEWS_GLYPH_MAP,
  ORG_ROLE_GLYPH_LIST,
  guideGlyph,
  hotelGlyph,
  newsGlyph,
  orgGlyph,
  personGlyph,
} from '@/lib/cardGlyphs';

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

  it('maps every news category to a real icon', () => {
    for (const c of Object.keys(NEWS_GLYPH_MAP)) {
      expect(TRANSIT_ICON_PATHS[newsGlyph(c)], c).toBeTruthy();
    }
    expect(newsGlyph('general')).toBe('news');
    expect(newsGlyph(null)).toBe('news');
  });

  it('resolves a guide category against the venue and event vocabularies, then its format', () => {
    expect(guideGlyph('sauna', 'guide')).toBe('waves');
    expect(guideGlyph('pride', 'guide')).toBe('flag');
    expect(guideGlyph('shopping', 'list')).toBe('shop');
    expect(guideGlyph('shopping', 'list', 'Jewelry shortlist')).toBe('jewelry');
    expect(guideGlyph('shopping', 'list', 'Underwear shortlist')).toBe('underwear');
    expect(guideGlyph('products', 'guide', 'Pride briefs: 5 queer-owned underwear picks')).toBe(
      'underwear',
    );
    expect(guideGlyph('shopping', 'list', 'Books & art shortlist')).toBe('library');
    expect(guideGlyph('shopping', 'list', 'Apparel shortlist')).toBe('apparel');
    expect(guideGlyph('sauna', 'guide', 'Jewelry')).toBe('waves');
    expect(guideGlyph('Lost Histories', 'quest')).toBe('flag');
    expect(guideGlyph(null, 'list')).toBe('list');
    expect(guideGlyph(null, null)).toBe('library');
    for (const g of [guideGlyph('bar', 'guide'), guideGlyph('services', 'guide')]) {
      expect(TRANSIT_ICON_PATHS[g]).toBeTruthy();
    }
  });

  it('picks an organization mark by role priority', () => {
    for (const [, g] of ORG_ROLE_GLYPH_LIST) expect(TRANSIT_ICON_PATHS[g], g).toBeTruthy();
    expect(orgGlyph(['seller', 'support'])).toBe('lifebuoy');
    expect(orgGlyph(['venue', 'publisher'])).toBe('news');
    expect(orgGlyph([])).toBe('building');
    expect(TRANSIT_ICON_PATHS[orgGlyph(null)]).toBeTruthy();
  });

  it('marks a city by what kind of city it is, national over regional', () => {
    expect(cityGlyph({ is_capital: true, is_regional_capital: true })).toBe('crown');
    expect(cityGlyph({ is_regional_capital: true })).toBe('landmark');
    expect(cityGlyph({})).toBe('building');
    expect(cityGlyph(null)).toBe('building');
    for (const g of ['crown', 'landmark', 'building']) expect(TRANSIT_ICON_PATHS).toHaveProperty(g);
  });

  it('gives a mixed-type card its family mark, and a venue its category mark', () => {
    expect(contentTypeGlyph('country')).toBe('globe');
    expect(contentTypeGlyph('city')).toBe('building');
    expect(contentTypeGlyph('venue', 'sauna')).not.toBe('pin');
    expect(contentTypeGlyph('venue')).toBe('pin');
    expect(contentTypeGlyph('something-new')).toBe('pin');
    for (const t of [
      'venue',
      'event',
      'hotel',
      'news',
      'marketplace',
      'personality',
      'city',
      'country',
      'queer_village',
      'guide',
      'organization',
      'group',
      'milestone',
      'tag',
    ])
      expect(TRANSIT_ICON_PATHS).toHaveProperty(contentTypeGlyph(t));
  });
});
