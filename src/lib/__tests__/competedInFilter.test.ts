import { describe, it, expect } from 'vitest';

import { COMPETITION_CATEGORIES } from '@/lib/competitionCategories';
import { groupCompetedInOptions, parseCompetedIn } from '@/lib/competedInFilter';

// Arrives in the RPC's order: by people count, descending.
const RPC_ORDER = [
  { slug: 'rupauls-drag-race', name: "RuPaul's Drag Race", category: 'drag_series', people: 194 },
  {
    slug: 'rupauls-drag-race-all-stars',
    name: "RuPaul's Drag Race All Stars",
    category: 'drag_series',
    people: 94,
  },
  { slug: 'canadas-drag-race', name: "Canada's Drag Race", category: 'drag_series', people: 48 },
  { slug: 'drag-race-espana', name: 'Drag Race España', category: 'drag_series', people: 33 },
  {
    slug: 'drag-race-down-under',
    name: 'Drag Race Down Under',
    category: 'drag_series',
    people: 23,
  },
  { slug: 'la-mas-draga', name: 'La Más Draga', category: 'drag_series', people: 5 },
  { slug: 'miss-continental', name: 'Miss Continental', category: 'drag_pageant', people: 5 },
  { slug: 'miss-gay-america', name: 'Miss Gay America', category: 'drag_pageant', people: 4 },
];

describe('groupCompetedInOptions', () => {
  it('sorts each type alphabetically, ignoring case and accents', () => {
    const groups = groupCompetedInOptions(RPC_ORDER, { locale: 'en', hideEmpty: true });
    const series = groups.find((g) => g.category.id === 'drag_series')!;
    expect(series.items.map((i) => i.name)).toEqual([
      "Canada's Drag Race",
      'Drag Race Down Under',
      'Drag Race España',
      'La Más Draga',
      "RuPaul's Drag Race",
      "RuPaul's Drag Race All Stars",
    ]);
    const pageants = groups.find((g) => g.category.id === 'drag_pageant')!;
    expect(pageants.items.map((i) => i.name)).toEqual(['Miss Continental', 'Miss Gay America']);
  });

  it('keeps the types in their canonical order and does not mutate the input', () => {
    const before = RPC_ORDER.map((o) => o.slug);
    const groups = groupCompetedInOptions(RPC_ORDER, { locale: 'en', hideEmpty: true });
    const canonical = COMPETITION_CATEGORIES.map((c) => c.id).filter((id) =>
      ['drag_series', 'drag_pageant'].includes(id),
    );
    expect(groups.map((g) => g.category.id)).toEqual(canonical);
    expect(RPC_ORDER.map((o) => o.slug)).toEqual(before);
  });

  it('hides empty types only when asked', () => {
    expect(groupCompetedInOptions(RPC_ORDER, { hideEmpty: true })).toHaveLength(2);
    expect(groupCompetedInOptions([], { hideEmpty: false })).toHaveLength(
      COMPETITION_CATEGORIES.length,
    );
  });
});

describe('parseCompetedIn', () => {
  it('distinguishes any, a category and a competition, and rejects junk', () => {
    expect(parseCompetedIn('any')).toEqual({ kind: 'any' });
    expect(parseCompetedIn('drag_series')).toEqual({ kind: 'category', id: 'drag_series' });
    expect(parseCompetedIn('rupauls-drag-race-uk')).toEqual({
      kind: 'competition',
      slug: 'rupauls-drag-race-uk',
    });
    expect(parseCompetedIn('Robert);drop')).toBeUndefined();
    expect(parseCompetedIn(undefined)).toBeUndefined();
  });
});

describe('topCompetitionsForCategory', () => {
  it('ranks by people, breaks ties by name, and counts the rest', async () => {
    const { topCompetitionsForCategory } = await import('@/lib/competedInFilter');
    const opts = [
      { slug: 'a', name: 'Zed', category: 'x', people: 5 },
      { slug: 'b', name: 'Bee', category: 'x', people: 9 },
      { slug: 'c', name: 'Ant', category: 'x', people: 5 },
      { slug: 'd', name: 'Dee', category: 'x', people: 1 },
      { slug: 'e', name: 'Other', category: 'y', people: 50 },
    ];
    const { shown, more } = topCompetitionsForCategory(opts, 'x', 3, 'en');
    expect(shown.map((o) => o.slug)).toEqual(['b', 'c', 'a']);
    expect(more).toBe(1);
    expect(topCompetitionsForCategory(opts, 'z', 3)).toEqual({ shown: [], more: 0 });
  });
});
