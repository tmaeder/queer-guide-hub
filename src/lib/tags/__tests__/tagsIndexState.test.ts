import { describe, it, expect } from 'vitest';
import {
  parseTagsParams,
  serializeTagsParams,
  applyTagsParams,
  normalizeLetter,
  letterFor,
  hasActiveFilters,
  compareTagsBy,
  DEFAULT_TAGS_STATE,
  TAG_SORTS,
  tagHasDefinition,
  tagPreviewText,
  type TagSortSubject,
} from '../tagsIndexState';

const sp = (s: string) => new URLSearchParams(s);

describe('parseTagsParams', () => {
  it('returns the defaults for an empty query with no drift', () => {
    const { state, changed, redirectTo } = parseTagsParams(sp(''));
    expect(state).toEqual(DEFAULT_TAGS_STATE);
    expect(changed).toBe(false);
    expect(redirectTo).toBeUndefined();
    expect(state.kind).toBe('concept');
  });

  it('preserves an explicit all-kinds choice while omitting the default term kind', () => {
    expect(serializeTagsParams(parseTagsParams(sp('kind=all')).state).toString()).toBe('kind=all');
    expect(serializeTagsParams(parseTagsParams(sp('kind=concept')).state).toString()).toBe('');
  });

  it('reports drift when every key is present at its default', () => {
    // The exact link the old page produced. It must collapse to bare /tags.
    const { state, changed } = parseTagsParams(
      sp('sort=usage&dir=desc&view=grid&usage=all&hasImage=0'),
    );
    expect(state).toEqual(DEFAULT_TAGS_STATE);
    expect(changed).toBe(true);
    expect(serializeTagsParams(state).toString()).toBe('');
  });

  it('keeps real filters and reports no drift', () => {
    const { state, changed } = parseTagsParams(sp('q=bear&view=list&sort=alphabetical&letter=B'));
    expect(state).toMatchObject({ q: 'bear', view: 'list', sort: 'alphabetical', letter: 'B' });
    expect(changed).toBe(false);
  });

  it('drops unrecognised enum values back to the default', () => {
    const { state, changed } = parseTagsParams(sp('view=carousel&sort=vibes&usage=maybe'));
    expect(state.view).toBe('grid');
    expect(state.sort).toBe('usage');
    expect(state.usage).toBe('all');
    expect(changed).toBe(true);
  });

  it('drops a malformed letter', () => {
    expect(parseTagsParams(sp('letter=ZZ')).state.letter).toBeNull();
    expect(parseTagsParams(sp('letter=b')).state.letter).toBe('B');
    expect(parseTagsParams(sp('letter=%23')).state.letter).toBe('#');
  });

  it('leaves params it does not own alone', () => {
    const { changed } = parseTagsParams(sp('utm_source=newsletter'));
    expect(changed).toBe(false);
  });

  it('is idempotent: serialize(parse(x)) is a fixed point', () => {
    for (const input of [
      '',
      'q=bear&view=chips',
      'sort=recent&dir=asc&letter=Q&usage=used&adult=1',
      'view=graph',
      'sort=usage&dir=desc&view=grid&usage=all&hasImage=0',
      'view=nonsense&letter=99',
    ]) {
      const once = serializeTagsParams(parseTagsParams(sp(input)).state).toString();
      const twice = serializeTagsParams(parseTagsParams(sp(once)).state).toString();
      expect(twice, `input: ${input}`).toBe(once);
      // A canonical URL must never report drift against itself.
      expect(parseTagsParams(sp(once)).changed, `input: ${input}`).toBe(false);
    }
  });
});

describe('legacy params redirect rather than filter', () => {
  const resolve = (v: string) => (v === 'Health & Wellness' ? 'health-wellness' : null);

  it('sends ?profession= to the personalities facet', () => {
    // It used to force a tag-NAME search for the profession string, which
    // searches the wrong noun entirely.
    const { redirectTo } = parseTagsParams(sp('profession=Author'));
    expect(redirectTo).toBe('/personalities?profession=Author');
  });

  it('sends ?cat=<name> to the category route, carrying other filters', () => {
    const { redirectTo } = parseTagsParams(sp('cat=Health+%26+Wellness&view=list'), resolve);
    expect(redirectTo).toBe('/tags/c/health-wellness?view=list');
  });

  it('accepts the older ?category= spelling too', () => {
    const { redirectTo } = parseTagsParams(sp('category=Health+%26+Wellness'), resolve);
    expect(redirectTo).toBe('/tags/c/health-wellness');
  });

  it('holds the param rather than dropping it while the tree is still loading', () => {
    const { redirectTo, changed } = parseTagsParams(sp('cat=Health+%26+Wellness'), () => null);
    expect(redirectTo).toBeUndefined();
    // Reporting drift here would strip the param before it could ever resolve.
    expect(changed).toBe(false);
  });

  it('ignores the legacy sentinel value', () => {
    expect(parseTagsParams(sp('cat=all'), resolve).redirectTo).toBeUndefined();
  });
});

describe('applyTagsParams', () => {
  it('preserves foreign params and clears the legacy ones', () => {
    const next = applyTagsParams(sp('utm_source=x&cat=Health&profession=Author'), {
      ...DEFAULT_TAGS_STATE,
      view: 'list',
    });
    expect(next.get('utm_source')).toBe('x');
    expect(next.get('cat')).toBeNull();
    expect(next.get('profession')).toBeNull();
    expect(next.get('view')).toBe('list');
  });

  it('removes an owned key when it returns to its default', () => {
    const next = applyTagsParams(sp('view=list&letter=B'), DEFAULT_TAGS_STATE);
    expect(next.toString()).toBe('');
  });
});

describe('letterFor', () => {
  it('files A–Z under their own letter, case-insensitively', () => {
    expect(letterFor('bear')).toBe('B');
    expect(letterFor('Bear')).toBe('B');
  });

  it('files digits, symbols and non-Latin scripts under #', () => {
    expect(letterFor('4chan')).toBe('#');
    expect(letterFor('+size')).toBe('#');
    expect(letterFor('Ãœbersexual')).toBe('#');
    expect(letterFor('クィア')).toBe('#');
  });

  it('ignores leading whitespace', () => {
    expect(letterFor('  drag')).toBe('D');
  });
});

describe('normalizeLetter', () => {
  it('accepts A–Z and #, rejects everything else', () => {
    expect(normalizeLetter('a')).toBe('A');
    expect(normalizeLetter('#')).toBe('#');
    expect(normalizeLetter('')).toBeNull();
    expect(normalizeLetter('AB')).toBeNull();
    expect(normalizeLetter(null)).toBeNull();
  });
});

describe('the retired hasImage param', () => {
  // The "Illustrated" filter left with glossary photography (TagPlate,
  // 2026-08-28). The key must be treated as legacy: reported as drift so the
  // caller's rewrite strips it from shared links, and never re-serialized.
  it('reports drift for any hasImage value and strips it on apply', () => {
    const { state, changed } = parseTagsParams(sp('hasImage=1&view=list'));
    expect(changed).toBe(true);
    expect(serializeTagsParams(state).toString()).toBe('view=list');
    const next = applyTagsParams(sp('hasImage=1&view=list'), state);
    expect(next.get('hasImage')).toBeNull();
    expect(next.get('view')).toBe('list');
  });
});

describe('hasActiveFilters', () => {
  it('is false for the pristine state', () => {
    expect(hasActiveFilters(DEFAULT_TAGS_STATE)).toBe(false);
  });

  it('does not count the display mode as a filter', () => {
    // Switching grid→graph narrows nothing, so it must not light up "Reset".
    expect(hasActiveFilters({ ...DEFAULT_TAGS_STATE, view: 'graph' })).toBe(false);
  });

  it('counts each narrowing control', () => {
    expect(hasActiveFilters({ ...DEFAULT_TAGS_STATE, q: 'bear' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_TAGS_STATE, letter: 'B' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_TAGS_STATE, usage: 'unused' })).toBe(true);
  });
});

describe('compareTagsBy', () => {
  const corpus = [
    { name: 'Ace', created_at: '2026-01-01' },
    { name: 'Bear', created_at: '2026-06-01' },
    { name: 'Cub', created_at: '2026-03-01' },
  ];
  const usage = { Ace: 1, Bear: 900, Cub: 40 };
  const order = (sort: (typeof TAG_SORTS)[number], dir: 'asc' | 'desc') =>
    [...corpus].sort(compareTagsBy(sort, dir, usage)).map((e) => e.name);

  // The one that matters: /tags with no params IS this comparison, so getting
  // its direction wrong opens the glossary on the least-used terms — which is
  // exactly what shipped until 2026-09-05.
  it('opens the default view on the MOST-used term', () => {
    expect(DEFAULT_TAGS_STATE.sort).toBe('usage');
    expect(DEFAULT_TAGS_STATE.dir).toBe('desc');
    expect(order(DEFAULT_TAGS_STATE.sort, DEFAULT_TAGS_STATE.dir)).toEqual(['Bear', 'Cub', 'Ace']);
  });

  it('sorts descending by the named quantity', () => {
    expect(order('usage', 'desc')).toEqual(['Bear', 'Cub', 'Ace']); // most used
    expect(order('recent', 'desc')).toEqual(['Bear', 'Cub', 'Ace']); // newest
    expect(order('alphabetical', 'desc')).toEqual(['Cub', 'Bear', 'Ace']); // Z→A
  });

  // The defect was one branch disagreeing with another about what `dir` means,
  // so assert the relationship across ALL sorts rather than three literals: asc
  // is the exact reverse of desc, whatever the branch computes.
  //
  // This corpus carries no descriptions, so `usage`'s definition tier is a
  // uniform tie here and the pure reversal property holds. It does NOT hold for
  // `usage` on a mixed corpus, and must not — see "ranks a definition ahead of
  // a blank entry" below, which asserts the tier survives `asc` rather than
  // flipping with it.
  it.each(TAG_SORTS)('makes asc the exact reverse of desc for sort=%s', (sort) => {
    expect(order(sort, 'asc')).toEqual([...order(sort, 'desc')].reverse());
  });

  it('treats a missing created_at as the oldest, not the newest', () => {
    const withNull = [{ name: 'Zed', created_at: null }, ...corpus];
    expect([...withNull].sort(compareTagsBy('recent', 'desc', usage)).at(-1)?.name).toBe('Zed');
  });
});

/**
 * The definition tier.
 *
 * Usage counts how often something was TAGGED, which is a property of the
 * ingest corpus and not of the entry. Locale codes and filter facets scraped
 * onto thousands of rows therefore outscored most of the real vocabulary, and
 * the default view led on entries that render a name and nothing else — `All`
 * (2,643 uses, no definition) sat at position 15, above `Identity` and `HIV`.
 */
describe('compareTagsBy — definition tier', () => {
  // Annotated, not inferred: `tagPreviewText` takes a TagPreviewSubject, which
  // has no `name`, so a bare `{ name: 'Blank' }` literal is rejected outright
  // (TS2559 — no properties in common) and `{ ...facet }` trips the
  // excess-property check. TagSortSubject extends TagPreviewSubject, which is
  // exactly the relationship the comparator relies on.
  const defined: TagSortSubject = { name: 'Defined', short_description: 'A real definition.' };
  const blank: TagSortSubject = { name: 'Blank' };
  const usage = { Defined: 1, Blank: 9000 };
  const names = (dir: 'asc' | 'desc', sort: 'usage' | 'alphabetical' = 'usage') =>
    [blank, defined].sort(compareTagsBy(sort, dir, usage)).map((e) => e.name);

  it('ranks a definition ahead of a blank entry even at 1 use against 9,000', () => {
    expect(names('desc')).toEqual(['Defined', 'Blank']);
  });

  it('keeps the tier under asc — "least used first" is a direction, "blanks first" is not', () => {
    // The tier sits OUTSIDE the single `asc` negation on purpose. Folding it
    // inside would make ascending usage lead on the entries with nothing to
    // read, which is the defect this tier exists to remove.
    expect(names('asc')).toEqual(['Defined', 'Blank']);
  });

  it('leaves alphabetical alone, or the A–Z letter rail stops being alphabetical', () => {
    expect(names('desc', 'alphabetical')).toEqual(['Defined', 'Blank']); // Z→A
    expect(names('asc', 'alphabetical')).toEqual(['Blank', 'Defined']); // A→Z
  });

  it('still orders by usage WITHIN each tier', () => {
    const corpus = [
      { name: 'LowDef', short_description: 'x' },
      { name: 'HighDef', short_description: 'y' },
      { name: 'LowBlank' },
      { name: 'HighBlank' },
    ];
    const counts = { LowDef: 2, HighDef: 500, LowBlank: 3, HighBlank: 7000 };
    expect([...corpus].sort(compareTagsBy('usage', 'desc', counts)).map((e) => e.name)).toEqual([
      'HighDef',
      'LowDef',
      'HighBlank',
      'LowBlank',
    ]);
  });

  it('reads the same fact the card renders', () => {
    // tagPreviewText is the single source; if the comparator judged on raw
    // columns instead, an attribute would sort as defined while its card
    // renders no blurb.
    expect(tagPreviewText(defined)).toBe('A real definition.');
    expect(tagHasDefinition(defined)).toBe(true);
    expect(tagHasDefinition(blank)).toBe(false);
  });

  it('does not count an attribute’s imported encyclopedia prose as a definition', () => {
    // "M" the letter, "3XL" the TV channel — the marketplace size facets carry
    // Wikipedia imports for a different sense of their name.
    const facet: TagSortSubject = {
      name: 'M',
      description: 'M is the thirteenth letter.',
      entity_kind: 'attribute',
    };
    expect(tagHasDefinition(facet)).toBe(false);
    // A curated short description on the same row IS shown, and does count.
    expect(tagHasDefinition({ ...facet, short_description: 'Medium.' })).toBe(true);
  });

  it('treats prose that cleans away to nothing as no definition', () => {
    const whitespaceOnly: TagSortSubject = { name: 'X', short_description: '   ' };
    expect(tagHasDefinition(whitespaceOnly)).toBe(false);
  });
});
