import { describe, expect, it } from 'vitest';
import { completeProse, continuationUrl } from '../proseFragment';

// Fixtures are real stored `personalities.bio` values (prod, 2026-11-27).
const RIVERA =
  'Sylvia Rivera (July 2, 1951 – February 19, 2002) was an American gay liberation and transgender rights activist who was also a noted community worker in New York. Rivera, who identified as a drag queen for most of her life and later as a transgender person, participated in demonstrations with the Gay Liberation Front.\nWith close friend Marsha P.';

describe('completeProse', () => {
  it('trims a name cut at its initial back to the last full sentence', () => {
    const r = completeProse(RIVERA);
    expect(r.isExcerpt).toBe(true);
    expect(r.text.endsWith('the Gay Liberation Front.')).toBe(true);
    expect(r.text).not.toContain('Marsha P.');
  });

  it('keeps a long final sentence that legitimately ends on a letter', () => {
    const t =
      'Nakhane is a South African musician. Madonna named them among her favourite artists and said their music influenced her 2019 album Madame X.';
    expect(completeProse(t)).toEqual({ text: t, isExcerpt: false });
  });

  it('keeps abbreviations such as Jr.', () => {
    const t =
      'Eden Atwood is an American jazz singer. She is the granddaughter of the novelist A. B. Guthrie Jr.';
    expect(completeProse(t).isExcerpt).toBe(false);
  });

  it('keeps short labels that never had punctuation', () => {
    expect(completeProse('German actor and singer')).toEqual({
      text: 'German actor and singer',
      isExcerpt: false,
    });
  });

  it('trims an unterminated trailing sentence on multi-sentence prose', () => {
    const t =
      'George Barasa is a Kenyan musician and activist who campaigns for LGBTQ rights. He later studied at York University in the Human Rights and Equity program';
    expect(completeProse(t)).toEqual({
      text: 'George Barasa is a Kenyan musician and activist who campaigns for LGBTQ rights.',
      isExcerpt: true,
    });
  });

  it('leaves complete prose and single sentences alone', () => {
    expect(completeProse('One sentence without an end').isExcerpt).toBe(false);
    expect(completeProse('A full one. And another.').isExcerpt).toBe(false);
    expect(completeProse('He said "yes." She left.').isExcerpt).toBe(false);
    expect(completeProse(null)).toEqual({ text: '', isExcerpt: false });
  });
});

describe('continuationUrl', () => {
  it('prefers the stored Wikipedia URL, then the Wikidata sitelink', () => {
    expect(continuationUrl('https://en.wikipedia.org/wiki/X', 'Q1')).toBe(
      'https://en.wikipedia.org/wiki/X',
    );
    expect(continuationUrl(null, 'Q2278761')).toBe(
      'https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/Q2278761',
    );
    expect(continuationUrl(null, 'SKIP_x')).toBeNull();
    expect(continuationUrl('javascript:alert(1)', null)).toBeNull();
  });
});
