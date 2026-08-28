import { describe, it, expect } from 'vitest';
import {
  parseTagsParams,
  serializeTagsParams,
  applyTagsParams,
  normalizeLetter,
  letterFor,
  hasActiveFilters,
  DEFAULT_TAGS_STATE,
} from '../tagsIndexState';

const sp = (s: string) => new URLSearchParams(s);

describe('parseTagsParams', () => {
  it('returns the defaults for an empty query with no drift', () => {
    const { state, changed, redirectTo } = parseTagsParams(sp(''));
    expect(state).toEqual(DEFAULT_TAGS_STATE);
    expect(changed).toBe(false);
    expect(redirectTo).toBeUndefined();
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
