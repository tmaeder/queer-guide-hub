import { describe, expect, it } from 'vitest';
import {
  MAX_LINKS_PER_DOCUMENT,
  MIN_SURFACE_FORM_LENGTH,
  findGlossaryLinks,
  glossaryHref,
  segmentGlossaryText,
  type GlossaryLinkTerm,
} from '../glossaryLinks';

/**
 * Each vocabulary is built fresh per test rather than shared: the compiled
 * regex is memoised on the ARRAY IDENTITY, so a shared literal would let one
 * test's compilation leak into another and hide a compilation bug.
 */
const vocab = (...terms: GlossaryLinkTerm[]): GlossaryLinkTerm[] => terms;

describe('findGlossaryLinks — word boundaries', () => {
  it('matches a standalone occurrence', () => {
    const spans = findGlossaryLinks(
      'Ask about PrEP before you travel.',
      vocab({ surfaceForm: 'PrEP', slug: 'prep' }),
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ slug: 'prep', label: 'PrEP', start: 10, end: 14 });
  });

  it('does NOT match a longer word that STARTS with the term', () => {
    // Guards the trailing boundary. Without it "prep" links inside
    // "preparation", "preparing", "prepped" — on every travel page we publish.
    const v = vocab({ surfaceForm: 'PrEP', slug: 'prep' });
    expect(findGlossaryLinks('Time spent preparing for the trip.', v)).toEqual([]);
    expect(findGlossaryLinks('A preparation checklist.', v)).toEqual([]);
    expect(findGlossaryLinks('They prepped the venue.', v)).toEqual([]);
  });

  it('does NOT match a longer word that ENDS with the term', () => {
    // Guards the LEADING boundary, which the test above cannot: every word
    // there has the term at its start, so only the trailing assertion fires.
    // Dropping the leading one links "care" inside "healthcare", "rape" inside
    // "drape", "hiv" inside "archive".
    expect(
      findGlossaryLinks('access to healthcare', vocab({ surfaceForm: 'care', slug: 'care' })),
    ).toEqual([]);
    expect(findGlossaryLinks('the archive', vocab({ surfaceForm: 'hiv', slug: 'hiv' }))).toEqual(
      [],
    );
    expect(
      findGlossaryLinks('a bathhouse', vocab({ surfaceForm: 'house', slug: 'house' })),
    ).toEqual([]);
  });

  it('does not treat an accented letter as a boundary', () => {
    // `\b` is ASCII-defined and would fire between "e" and "é", linking "care"
    // inside "caré". The Unicode lookarounds are what prevent it.
    expect(findGlossaryLinks('caré', vocab({ surfaceForm: 'care', slug: 'care' }))).toEqual([]);
    expect(findGlossaryLinks('Ärztin', vocab({ surfaceForm: 'rzt', slug: 'rzt' }))).toEqual([]);
  });

  it('handles a surface form that starts or ends with a digit', () => {
    const spans = findGlossaryLinks(
      'Repealed by Section 28 in 2003.',
      vocab({ surfaceForm: 'Section 28', slug: 'section-28' }),
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].label).toBe('Section 28');
  });

  it('is case-insensitive but keeps the source casing as the label', () => {
    // Substituting the vocabulary's spelling would silently edit the prose.
    const spans = findGlossaryLinks(
      'chosen family matters',
      vocab({ surfaceForm: 'Chosen Family', slug: 'chosen-family' }),
    );
    expect(spans[0].label).toBe('chosen family');
  });
});

describe('findGlossaryLinks — regex-metacharacter surface forms', () => {
  it('treats metacharacters as literals rather than throwing or over-matching', () => {
    // An unescaped "C++" is an invalid quantifier and throws at construction,
    // which would take out the whole vocabulary, not just this term.
    const v = vocab(
      { surfaceForm: 'C++', slug: 'cpp' },
      { surfaceForm: 'A.B.C', slug: 'abc' },
      { surfaceForm: 'what?', slug: 'what' },
      { surfaceForm: '(parens)', slug: 'parens' },
      { surfaceForm: 'a|b', slug: 'a-or-b' },
    );
    expect(() => findGlossaryLinks('x', v)).not.toThrow();
    expect(findGlossaryLinks('we use A.B.C here', v)[0]?.label).toBe('A.B.C');
    // "AxBxC" must NOT match: an unescaped "." would make it.
    expect(findGlossaryLinks('we use AxBxC here', v)).toEqual([]);
  });

  it('does not throw on a hyphenated surface form', () => {
    // `\-` is an invalid identity escape under the `u` flag; escaping hyphens
    // would throw at construction for every term containing one.
    const v = vocab(
      { surfaceForm: '2C-T-7', slug: '2c-t-7' },
      { surfaceForm: 'gay-friendly', slug: 'gay-friendly' },
    );
    expect(() => findGlossaryLinks('x', v)).not.toThrow();
    expect(findGlossaryLinks('a gay-friendly hotel', v)[0]?.label).toBe('gay-friendly');
  });
});

describe('findGlossaryLinks — longest match wins', () => {
  it('prefers the longer term when two overlap at the same position', () => {
    const spans = findGlossaryLinks(
      'They built a chosen family together.',
      vocab(
        { surfaceForm: 'family', slug: 'family' },
        { surfaceForm: 'chosen family', slug: 'chosen-family' },
      ),
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].slug).toBe('chosen-family');
  });

  it('prefers the longer term even when the shorter one is a whole-word prefix', () => {
    // This is the case the length sort actually exists for, and the test above
    // does NOT cover it. "chosen" sorts alphabetically BEFORE "chosen family",
    // so without the length-descending sort the alternation tries "chosen"
    // first — and unlike "bath" inside "bathhouse", it is followed by a space,
    // so the trailing boundary assertion PASSES and the shorter term wins.
    // Result: "chosen" links and the compound term never fires.
    const spans = findGlossaryLinks(
      'They built a chosen family.',
      vocab(
        { surfaceForm: 'chosen', slug: 'chosen' },
        { surfaceForm: 'chosen family', slug: 'chosen-family' },
      ),
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ slug: 'chosen-family', label: 'chosen family' });
  });

  it('is insensitive to vocabulary input order', () => {
    const forward = findGlossaryLinks(
      'a chosen family',
      vocab(
        { surfaceForm: 'chosen family', slug: 'chosen-family' },
        { surfaceForm: 'family', slug: 'family' },
      ),
    );
    const reverse = findGlossaryLinks(
      'a chosen family',
      vocab(
        { surfaceForm: 'family', slug: 'family' },
        { surfaceForm: 'chosen family', slug: 'chosen-family' },
      ),
    );
    expect(forward).toEqual(reverse);
  });

  it('never returns overlapping spans', () => {
    const spans = findGlossaryLinks(
      'chosen family and found family and family',
      vocab(
        { surfaceForm: 'chosen family', slug: 'chosen-family' },
        { surfaceForm: 'found family', slug: 'found-family' },
        { surfaceForm: 'family', slug: 'family' },
      ),
    );
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
    }
  });
});

describe('findGlossaryLinks — first mention only', () => {
  it('links a term once however often it appears', () => {
    const spans = findGlossaryLinks(
      'PrEP is not PEP. PrEP is daily; PrEP is preventive. PrEP again.',
      vocab({ surfaceForm: 'PrEP', slug: 'prep' }),
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].start).toBe(0);
  });

  it('still links a different term later in the same text', () => {
    const spans = findGlossaryLinks(
      'PrEP is not PEP, and PEP is not PrEP.',
      vocab({ surfaceForm: 'PrEP', slug: 'prep' }, { surfaceForm: 'PEP', slug: 'pep' }),
    );
    expect(spans.map((s) => s.slug)).toEqual(['prep', 'pep']);
  });

  it('dedupes by slug, not by surface form', () => {
    // Two spellings of one entry are one link, not two.
    const spans = findGlossaryLinks(
      'Deadnaming, or dead naming, is harmful.',
      vocab(
        { surfaceForm: 'Deadnaming', slug: 'deadnaming' },
        { surfaceForm: 'dead naming', slug: 'deadnaming' },
      ),
    );
    expect(spans).toHaveLength(1);
  });
});

describe('findGlossaryLinks — caps and self-links', () => {
  const many = vocab(
    { surfaceForm: 'alpha term', slug: 'a' },
    { surfaceForm: 'bravo term', slug: 'b' },
    { surfaceForm: 'charlie term', slug: 'c' },
    { surfaceForm: 'delta term', slug: 'd' },
    { surfaceForm: 'echo term', slug: 'e' },
    { surfaceForm: 'foxtrot term', slug: 'f' },
    { surfaceForm: 'golf term', slug: 'g' },
  );
  const text = 'alpha term bravo term charlie term delta term echo term foxtrot term golf term';

  it('caps at MAX_LINKS_PER_DOCUMENT by default', () => {
    expect(findGlossaryLinks(text, many)).toHaveLength(MAX_LINKS_PER_DOCUMENT);
  });

  it('honours an explicit lower cap', () => {
    expect(findGlossaryLinks(text, many, { maxLinks: 2 })).toHaveLength(2);
  });

  it('returns nothing at a cap of zero', () => {
    expect(findGlossaryLinks(text, many, { maxLinks: 0 })).toEqual([]);
  });

  it('never links a term to the page it is already on', () => {
    const spans = findGlossaryLinks(
      'Chemsex and chill-out culture overlap.',
      vocab(
        { surfaceForm: 'Chemsex', slug: 'chemsex' },
        { surfaceForm: 'chill-out', slug: 'chill-out' },
      ),
      { currentSlug: 'chemsex' },
    );
    expect(spans.map((s) => s.slug)).toEqual(['chill-out']);
  });

  it('compares the self-link slug case-insensitively', () => {
    const spans = findGlossaryLinks('PrEP', vocab({ surfaceForm: 'PrEP', slug: 'PrEP' }), {
      currentSlug: 'prep',
    });
    expect(spans).toEqual([]);
  });

  it('does not let a suppressed self-link consume one of the cap slots', () => {
    const spans = findGlossaryLinks(text, many, { currentSlug: 'a', maxLinks: 3 });
    expect(spans.map((s) => s.slug)).toEqual(['b', 'c', 'd']);
  });
});

describe('findGlossaryLinks — minimum surface-form length', () => {
  it('refuses a surface form below the floor even if it is in the vocabulary', () => {
    // The measured worst case: a real `status='active'`, `seo_indexable=true`
    // tag named "A" matched 747 of 800 city descriptions. Review is the primary
    // defence; this is the backstop under it.
    expect(MIN_SURFACE_FORM_LENGTH).toBeGreaterThan(1);
    const spans = findGlossaryLinks(
      'A town on a river.',
      vocab({ surfaceForm: 'A', slug: 'a' }, { surfaceForm: 'town', slug: 'town' }),
    );
    expect(spans.map((s) => s.slug)).toEqual(['town']);
  });

  it('drops unusable rows without discarding the rest of the vocabulary', () => {
    const spans = findGlossaryLinks(
      'the chosen family',
      vocab(
        { surfaceForm: '', slug: 'empty' },
        { surfaceForm: '   ', slug: 'blank' },
        { surfaceForm: 'chosen family', slug: 'chosen-family' },
      ),
    );
    expect(spans.map((s) => s.slug)).toEqual(['chosen-family']);
  });

  it('returns nothing for an empty vocabulary or empty text', () => {
    expect(findGlossaryLinks('anything at all', [])).toEqual([]);
    expect(findGlossaryLinks('', vocab({ surfaceForm: 'PrEP', slug: 'prep' }))).toEqual([]);
  });
});

describe('findGlossaryLinks — plural matching', () => {
  it('matches a plural only when the term opts in', () => {
    const optIn = vocab({
      surfaceForm: 'chosen family',
      slug: 'chosen-family',
      matchMode: 'exact_plural',
    });
    expect(findGlossaryLinks('two chosen families', optIn)[0]?.label).toBe('chosen families');

    const optOut = vocab({ surfaceForm: 'chosen family', slug: 'chosen-family' });
    expect(findGlossaryLinks('two chosen families', optOut)).toEqual([]);
  });

  it('resolves a plural match back to the right slug', () => {
    const spans = findGlossaryLinks(
      'poppers and bathhouses',
      vocab({ surfaceForm: 'bathhouse', slug: 'bathhouse', matchMode: 'exact_plural' }),
    );
    expect(spans[0]).toMatchObject({ slug: 'bathhouse', label: 'bathhouses' });
  });

  it('applies the three regular English patterns and the singular still matches', () => {
    // `-y` → `-ies` is the one a naive `s?` gets wrong: "chosen familys" is not
    // a word, so the whole opt-in silently did nothing.
    const cases: Array<[string, string, string]> = [
      ['chosen family', 'chosen families', 'chosen-family'], // consonant + y
      ['bathhouse', 'bathhouses', 'bathhouse'], // plain + s
      ['bus', 'buses', 'bus'], // sibilant + es
      ['sex worker', 'sex workers', 'sex-worker'],
      ['day', 'days', 'day'], // vowel + y takes the plain rule
    ];
    for (const [singular, plural, slug] of cases) {
      const v = vocab({ surfaceForm: singular, slug, matchMode: 'exact_plural' });
      expect(findGlossaryLinks(`about ${plural} here`, v)[0]).toMatchObject({
        slug,
        label: plural,
      });
      expect(findGlossaryLinks(`about ${singular} here`, v)[0]).toMatchObject({
        slug,
        label: singular,
      });
    }
  });

  it('does not invent an irregular plural', () => {
    // Left to a second reviewed row on purpose, rather than a rule that is
    // right most of the time.
    const v = vocab({ surfaceForm: 'person', slug: 'person', matchMode: 'exact_plural' });
    expect(findGlossaryLinks('two people', v)).toEqual([]);
  });
});

describe('segmentGlossaryText', () => {
  it('reconstructs the original text exactly', () => {
    const text = 'Ask about PrEP, and about chosen family, before you go.';
    const segments = segmentGlossaryText(
      text,
      vocab(
        { surfaceForm: 'PrEP', slug: 'prep' },
        { surfaceForm: 'chosen family', slug: 'chosen-family' },
      ),
    );
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.filter((s) => s.kind === 'link').map((s) => s.text)).toEqual([
      'PrEP',
      'chosen family',
    ]);
  });

  it('returns a single text segment when nothing matches', () => {
    expect(
      segmentGlossaryText('nothing here', vocab({ surfaceForm: 'PrEP', slug: 'prep' })),
    ).toEqual([{ kind: 'text', text: 'nothing here' }]);
  });

  it('returns nothing for empty input', () => {
    expect(segmentGlossaryText('', vocab({ surfaceForm: 'PrEP', slug: 'prep' }))).toEqual([]);
  });

  it('handles a match at the very start and very end', () => {
    const text = 'PrEP and PEP';
    const segments = segmentGlossaryText(
      text,
      vocab({ surfaceForm: 'PrEP', slug: 'prep' }, { surfaceForm: 'PEP', slug: 'pep' }),
    );
    expect(segments[0]).toEqual({ kind: 'link', text: 'PrEP', slug: 'prep' });
    expect(segments.at(-1)).toEqual({ kind: 'link', text: 'PEP', slug: 'pep' });
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });
});

describe('glossaryHref', () => {
  it('mirrors TagChip.tagHref', () => {
    expect(glossaryHref('Chosen-Family')).toBe('/tags/chosen-family');
  });

  it('encodes a slug that would otherwise break the url', () => {
    expect(glossaryHref('a/b')).toBe('/tags/a%2Fb');
  });
});

describe('determinism', () => {
  it('produces identical spans for two separately-built copies of one vocabulary', () => {
    // The SPA and the edge each build their own array from the same rows. If
    // the result depended on array identity or insertion order, the two
    // surfaces would drift and break the cloaking rule in docs/SEO.md.
    const text = 'A chosen family may share poppers, PrEP and a bathhouse.';
    const build = (): GlossaryLinkTerm[] => [
      { surfaceForm: 'bathhouse', slug: 'bathhouse' },
      { surfaceForm: 'chosen family', slug: 'chosen-family' },
      { surfaceForm: 'poppers', slug: 'poppers' },
      { surfaceForm: 'PrEP', slug: 'prep' },
    ];
    expect(findGlossaryLinks(text, build())).toEqual(findGlossaryLinks(text, build()));
  });
});
