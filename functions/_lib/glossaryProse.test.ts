import { describe, expect, it } from 'vitest';
import { paragraphsHtml, paragraphsHtmlLinked } from './detail';
import { segmentGlossaryText, type GlossaryLinkTerm } from '../../src/lib/glossaryLinks';

/**
 * The crawler half of inline glossary links.
 *
 * Two properties matter here and neither is checked by the matcher's own tests:
 * that source text can never become markup, and that the bot's link set is the
 * same one the SPA renders (docs/SEO.md's cloaking rule requires the bot set to
 * be a subset of the human one — equality is the strongest form of that).
 */

const vocab = (...terms: GlossaryLinkTerm[]): GlossaryLinkTerm[] => terms;

/**
 * Parse the first anchor out of the emitted HTML.
 *
 * A real parser rather than a regex, because the question these tests ask is
 * whether the browser will see an extra ATTRIBUTE — and a regex cannot tell an
 * attribute name from the same characters appearing inside a quoted value. A
 * first draft asserted `not.toMatch(/href="[^"]*"[^>]*onmouseover/)` and failed
 * on output that was perfectly safe: `onmouseover` sat inside an escaped
 * `data-glossary-link` value, inert. The parser answers the real question.
 */
function anchorOf(html: string): { href: string | null; attrs: string[]; text: string } | null {
  const el = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').querySelector('a');
  if (!el) return null;
  return { href: el.getAttribute('href'), attrs: el.getAttributeNames().sort(), text: el.textContent ?? '' };
}

describe('paragraphsHtmlLinked — escaping contract', () => {
  it('escapes markup in the surrounding prose exactly as paragraphsHtml does', () => {
    const html = paragraphsHtmlLinked(
      'Ask about PrEP & <script>alert(1)</script> "quoted" text.',
      vocab({ surfaceForm: 'PrEP', slug: 'prep' }),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
    // stripHtml removes the tags, escape neutralises what is left.
    expect(html).toContain('alert(1)');
  });

  it('escapes the LABEL of a link, so matched source text cannot inject markup', () => {
    // A surface form is reviewed, but the text it matches is not: the label is
    // whatever the document said, including its casing and any adjacent
    // characters the boundary rules allowed.
    const html = paragraphsHtmlLinked(
      'the "PrEP" programme',
      vocab({ surfaceForm: 'PrEP', slug: 'prep' }),
    );
    expect(anchorOf(html)).toMatchObject({ href: '/tags/prep', text: 'PrEP' });
    expect(html).toContain('&quot;');
  });

  it('cannot be made to emit an extra attribute, even by a hostile slug', () => {
    // A slug is written by an admin, but this is the last line of defence: a
    // quote that escaped both the percent-encoding and the HTML-escaping would
    // close the attribute and let the rest become event handlers.
    const html = paragraphsHtmlLinked(
      'a term here',
      vocab({ surfaceForm: 'term', slug: 'a"onmouseover=alert(1) x' }),
    );
    const a = anchorOf(html);
    // Exactly the two attributes we emit — no onmouseover, no anything else.
    expect(a?.attrs).toEqual(['data-glossary-link', 'href']);
    // The quote is percent-encoded inside the href by glossaryHref…
    expect(a?.href).toContain('%22');
    expect(a?.href).not.toContain('"');
    // …and HTML-escaped in the data attribute, so neither can terminate it.
    expect(html).toContain('&quot;');
  });

  it('emits no anchor at all for an empty vocabulary', () => {
    const html = paragraphsHtmlLinked('Ask about PrEP.', []);
    expect(html).toBe('<p>Ask about PrEP.</p>');
    expect(html).not.toContain('<a ');
  });

  it('never links the page to itself', () => {
    const html = paragraphsHtmlLinked(
      'PrEP is taken daily.',
      vocab({ surfaceForm: 'PrEP', slug: 'prep' }),
      { currentSlug: 'prep' },
    );
    expect(html).not.toContain('<a ');
  });

  it('strips html from the source before matching, so markup cannot hide a term', () => {
    const html = paragraphsHtmlLinked(
      'Ask about <em>PrEP</em> today.',
      vocab({ surfaceForm: 'PrEP', slug: 'prep' }),
    );
    expect(anchorOf(html)).toMatchObject({ href: '/tags/prep', text: 'PrEP' });
    expect(html).not.toContain('<em>');
  });
});

describe('paragraphsHtmlLinked — paragraph structure matches paragraphsHtml', () => {
  // THE REGRESSION THIS FILE EXISTS TO STOP. The linked variant shipped with its
  // own older copy of the splitter (`collapseWs` before the split, which can
  // never emit more than one `<p>`). When the real paragraph fix landed on
  // `paragraphsHtml`, git auto-merged the two with NO conflict — and because all
  // 13 crawler call sites render through the linked one, every detail page would
  // have gone back to a single run-on block under a green diff. Both now share
  // `splitParagraphs`; these tests fail the moment they diverge again.
  const corpus: Array<[string, string]> = [
    ['blank-line separated', 'First paragraph here.\n\nSecond paragraph here.\n\nThird one.'],
    // The village/city shape: single newline after terminal punctuation, never a
    // blank line. 106 of 175 `queer_villages.history` rows look like this.
    ['single newline after a full stop', 'The bar opened in 1974.\nIt closed in 1990.'],
    // The events shape: headings and timetables with no terminal punctuation.
    ['heading then capitalised line', 'Zugänglichkeit\nDer Eingang ist stufenlos.'],
    ['timetable lines', '23.15h - Milky Diamond\n23.30h - Sado Opera'],
    // Must NOT split: a hard-wrapped single sentence.
    ['hard-wrapped sentence', 'in the City of Salford in Greater Manchester, England,\n3 miles west.'],
    ['typewriter double space', 'Population was 60 at the 2000 census.  The area is named for a river.'],
  ];

  const countParagraphs = (html: string) => (html.match(/<p>/g) ?? []).length;

  for (const [name, text] of corpus) {
    it(`agrees on ${name}`, () => {
      // An empty vocabulary delegates, so it proves nothing — use a term that is
      // present, so the linked path really runs its own paragraph assembly.
      const v = vocab({ surfaceForm: 'the', slug: 'the-term' });
      const plain = paragraphsHtml(text);
      const linked = paragraphsHtmlLinked(text, v);
      expect(countParagraphs(linked), `paragraph count diverged on: ${name}`).toBe(
        countParagraphs(plain),
      );
      // And the text is identical once the anchors are removed.
      expect(linked.replace(/<\/?a(?: [^>]*)?>/g, '')).toBe(plain);
    });
  }

  it('emits more than one paragraph, so the count assertions above are not vacuous', () => {
    const text = 'First paragraph here.\n\nSecond paragraph here.';
    expect(countParagraphs(paragraphsHtml(text))).toBe(2);
    expect(countParagraphs(paragraphsHtmlLinked(text, vocab({ surfaceForm: 'First', slug: 'f' })))).toBe(2);
  });

  it('links a term once across the whole document, not once per paragraph', () => {
    // The reason the matcher runs on the rejoined document: a per-paragraph pass
    // would re-link the same term in every paragraph and multiply the cap.
    const html = paragraphsHtmlLinked(
      'PrEP in one.\n\nPrEP in two.\n\nPrEP in three.',
      vocab({ surfaceForm: 'PrEP', slug: 'prep' }),
    );
    expect([...html.matchAll(/data-glossary-link=/g)]).toHaveLength(1);
    expect(countParagraphs(html)).toBe(3);
  });

  it('never leaves a blank-line join visible in the output', () => {
    const html = paragraphsHtmlLinked(
      'One.\n\nTwo.',
      vocab({ surfaceForm: 'One', slug: 'one' }),
    );
    expect(html).not.toMatch(/<p>\s*<\/p>/);
    expect(html).not.toContain('\n\n');
  });
});

describe('paragraphsHtmlLinked — parity with the SPA', () => {
  it('links exactly the terms segmentGlossaryText selects, in the same order', () => {
    // The SPA renders from segmentGlossaryText directly. If these two ever
    // disagree the bot is served a different link set than a human, which is
    // the cloaking failure docs/SEO.md warns about.
    const text =
      'A chosen family may share poppers and PrEP, and may meet at a bathhouse or a sauna.';
    const v = vocab(
      { surfaceForm: 'chosen family', slug: 'chosen-family' },
      { surfaceForm: 'poppers', slug: 'poppers' },
      { surfaceForm: 'PrEP', slug: 'prep' },
      { surfaceForm: 'bathhouse', slug: 'bathhouse' },
      { surfaceForm: 'sauna', slug: 'sauna' },
    );

    const spaSlugs = segmentGlossaryText(text, v)
      .filter((s) => s.kind === 'link')
      .map((s) => (s.kind === 'link' ? s.slug : ''));

    const html = paragraphsHtmlLinked(text, v);
    const botSlugs = [...html.matchAll(/href="\/tags\/([^"]+)"/g)].map((m) => m[1]);

    expect(botSlugs).toEqual(spaSlugs);
    expect(botSlugs.length).toBeGreaterThan(0);
  });

  it('honours the per-document cap, so the bot set can never exceed the human one', () => {
    const v = vocab(
      { surfaceForm: 'alpha term', slug: 'a' },
      { surfaceForm: 'bravo term', slug: 'b' },
      { surfaceForm: 'charlie term', slug: 'c' },
      { surfaceForm: 'delta term', slug: 'd' },
      { surfaceForm: 'echo term', slug: 'e' },
      { surfaceForm: 'foxtrot term', slug: 'f' },
    );
    const html = paragraphsHtmlLinked(
      'alpha term bravo term charlie term delta term echo term foxtrot term',
      v,
    );
    expect([...html.matchAll(/<a /g)]).toHaveLength(5);
  });

  it('preserves the prose verbatim apart from the anchors', () => {
    const text = 'Ask about PrEP before you travel.';
    const html = paragraphsHtmlLinked(text, vocab({ surfaceForm: 'PrEP', slug: 'prep' }));
    expect(html.replace(/<\/?(?:a|p)(?: [^>]*)?>/g, '')).toBe(text);
  });
});
