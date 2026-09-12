/**
 * `paragraphsHtml` renders the prose body of every crawler-facing detail page —
 * 13 call sites across venue, event, news, personality (description + bio),
 * city, country, hotel (description + safety notes), village (description +
 * history), tag, milestone and guide.
 *
 * It could never emit more than one `<p>`. It called `collapseWs` — a bare
 * `\s+ -> ' '` — BEFORE splitting, so every `\n` was already a single space by
 * the time the split ran and neither arm could match. Googlebot was served one
 * undifferentiated block on every one of those pages.
 *
 * The cases below are the four decisions that fix encodes, each measured
 * against the live corpus (counts in the function's own comment). Three of them
 * are guards against a plausible over-correction rather than against the
 * original bug, which is why they are worth their own cases: splitting on any
 * newline cuts real sentences in half, and reviving the old `\s{2,}` arm
 * fragments running text at typewriter-style double spaces.
 *
 * Strings marked "prod" are real rows, kept verbatim so a future change is
 * judged against the corpus rather than against invented prose.
 */
import { describe, it, expect } from 'vitest';
import { paragraphsHtml } from './detail';

const paras = (s: string) => Array.from(s.matchAll(/<p>(.*?)<\/p>/gs), (m) => m[1]);

describe('paragraphsHtml', () => {
  it('splits on a blank line', () => {
    const out = paragraphsHtml('First paragraph here.\n\nSecond paragraph here.\n\nThird one.');
    expect(paras(out)).toEqual(['First paragraph here.', 'Second paragraph here.', 'Third one.']);
  });

  it('splits on a single newline that follows sentence-terminal punctuation', () => {
    // prod: queer_villages.history (Ikebukuro) — 106 of 175 rows separate
    // paragraphs this way and NOT ONE of them contains a blank line, so a
    // blank-line-only rule leaves every village history page a single block.
    const out = paragraphsHtml(
      'Notable landmarks in Ikebukuro include the Toshima Ward Office.\nSince the 1980s, the district has grown.',
    );
    expect(paras(out)).toEqual([
      'Notable landmarks in Ikebukuro include the Toshima Ward Office.',
      'Since the 1980s, the district has grown.',
    ]);
  });

  it('splits when the line break carries trailing spaces', () => {
    // prod: queer_villages.history (Chueca) — "…Federico Chueca.  \nIt is located…"
    expect(
      paras(paragraphsHtml('Named after Federico Chueca.  \nIt is located in Justicia.')),
    ).toEqual(['Named after Federico Chueca.', 'It is located in Justicia.']);
  });

  it('does NOT split a sentence hard-wrapped across lines', () => {
    // A bare `\n+` split produced 22 of these across a 1,182-row prod sample.
    // prod shape: events.description German copy wrapped mid-clause.
    const out = paragraphsHtml(
      'das auf den Namen Rudolph hörte\nund durch kalte Winternächte röhrte.',
    );
    expect(paras(out)).toEqual([
      'das auf den Namen Rudolph hörte und durch kalte Winternächte röhrte.',
    ]);
  });

  it('does NOT split at a typewriter double space after a full stop', () => {
    // The old dead `(?<=[.!?])\s{2,}` arm. Reviving it fragments running text on
    // 110 venues, 117 cities and 35 events rows. prod: cities.description.
    const out = paragraphsHtml(
      'West Frankfort is a city in Franklin County, Illinois.  The population was 7,275 at the 2020 census.',
    );
    expect(paras(out)).toEqual([
      'West Frankfort is a city in Franklin County, Illinois. The population was 7,275 at the 2020 census.',
    ]);
  });

  it('collapses whitespace inside a paragraph but not across paragraphs', () => {
    const out = paragraphsHtml('  Alpha   beta\tgamma.  \n\n   Delta\n   epsilon  ');
    expect(paras(out)).toEqual(['Alpha beta gamma.', 'Delta epsilon']);
  });

  it('drops empty segments instead of emitting an empty <p>', () => {
    // prod: unified_tags.description rows begin with a stray leading newline.
    expect(paras(paragraphsHtml('\n\nA pride parade is an event.\n\n\n'))).toEqual([
      'A pride parade is an event.',
    ]);
    expect(paragraphsHtml('   \n\n  ')).toBe('');
  });

  it('strips tags and escapes the remaining text', () => {
    const out = paragraphsHtml('<b>Bar</b> & grill.\n\nOpen "late" <today>');
    expect(paras(out)).toEqual(['Bar &amp; grill.', 'Open &quot;late&quot;']);
    expect(out).not.toContain('<b>');
  });
});
