/**
 * What this file exists to preserve:
 *
 *  1. An explicit photograph NEVER renders to a reader who has not affirmed
 *     their age, and never under safe mode. Those are the two ways this feature
 *     can do real harm, so they are asserted directly rather than inferred from
 *     the component tree.
 *  2. The credit renders whenever the image does. A CC BY-SA photograph without
 *     a visible credit is a licence breach, so "the image appeared" is only half
 *     the assertion.
 *  3. The band stands down for a diagram, which is the anti-redundancy rule.
 *  4. `shouldShowTagFigure` is the ONE implementation of the show-condition.
 *     `TagDetail` uses it to decide whether to push a `photo` stop onto the
 *     route strip, and that file's comment is explicit that the station array's
 *     order must match the JSX order "or the strip highlights the wrong stop
 *     while scrolling" — so a second copy of this rule is a real defect, not an
 *     untidiness.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagFigure } from '../TagFigure';
import { shouldShowTagFigure } from '@/lib/tags/tagFigureVisibility';
import { formatImageCredit } from '@/lib/imageCredit';
import { figuresForSlug } from '../infographics/registry';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k, i18n: { language: 'en' } }),
}));

/** The predicate's own inputs — exactly five, no component props. */
const vis = {
  imageUrl: 'https://img.queer.guide/tag-images/abc.jpg',
  imageExplicit: false,
  pageAlreadyGated: false,
  safeMode: false,
  hasFigure: false,
};

const base = {
  slug: 'leather',
  name: 'Leather',
  imageUrl: vis.imageUrl,
  imageAlt: 'A set of leather working tools.',
  imageSource: 'wikimedia',
  imageLicense: 'CC BY-SA 4.0',
  imageAttribution: 'Scott Bauer',
  imageExplicit: false,
  pageAlreadyGated: false,
  safeMode: false,
};

describe('shouldShowTagFigure', () => {
  it('shows a licensed non-explicit photograph', () => {
    expect(shouldShowTagFigure(vis)).toBe(true);
  });

  it('shows nothing when there is no image — coverage is an outcome, not a target', () => {
    expect(shouldShowTagFigure({ ...vis, imageUrl: null })).toBe(false);
    expect(shouldShowTagFigure({ ...vis, imageUrl: undefined })).toBe(false);
  });

  it('HIDES an explicit photograph from an un-affirmed reader', () => {
    expect(shouldShowTagFigure({ ...vis, imageExplicit: true, pageAlreadyGated: false })).toBe(
      false,
    );
  });

  it('shows an explicit photograph only once the page is gated', () => {
    expect(shouldShowTagFigure({ ...vis, imageExplicit: true, pageAlreadyGated: true })).toBe(true);
  });

  it('HIDES an explicit photograph under safe mode even on a gated page', () => {
    // Both conditions, because safe mode is a separate choice from age
    // affirmation: an affirmed adult may still have safe mode on.
    expect(
      shouldShowTagFigure({
        ...vis,
        imageExplicit: true,
        pageAlreadyGated: true,
        safeMode: true,
      }),
    ).toBe(false);
  });

  it('leaves a NON-explicit photograph alone under safe mode', () => {
    // Safe mode is not a photography switch. Over-hiding here would make the
    // band read as broken on a perfectly ordinary term.
    expect(shouldShowTagFigure({ ...vis, safeMode: true })).toBe(true);
  });

  it('stands down for a term that already carries a diagram', () => {
    expect(shouldShowTagFigure({ ...vis, hasFigure: true })).toBe(false);
  });
});

describe('TagFigure', () => {
  it('renders the image WITH its credit', () => {
    render(<TagFigure {...base} />);
    const img = screen.getByAltText('A set of leather working tools.');
    expect(img).toBeInTheDocument();
    // The licence obligation, asserted as text a reader can see.
    expect(screen.getByTitle(/Scott Bauer/)).toBeInTheDocument();
    expect(screen.getByTitle(/CC BY-SA 4\.0/)).toBeInTheDocument();
  });

  it('renders nothing at all when the predicate says no', () => {
    const { container } = render(<TagFigure {...base} imageExplicit pageAlreadyGated={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to the tag name for alt rather than rendering an empty alt', () => {
    render(<TagFigure {...base} imageAlt={null} />);
    expect(screen.getByAltText('Leather')).toBeInTheDocument();
  });

  it('stands down for a term that already carries a diagram', () => {
    // The registry lookup lives in the component (the predicate takes a plain
    // boolean so `src/lib` need not import out of `src/components`), so the
    // yielding is asserted HERE and against the REAL registry rather than a
    // mock — retiring that figure surfaces as a failure instead of silently
    // changing what readers see.
    const subject = figuresForSlug('consent');
    expect(subject.length).toBeGreaterThan(0); // control: the fixture is real
    const { container } = render(<TagFigure {...base} slug="consent" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('formatImageCredit', () => {
  it('returns null rather than an empty string when there is nothing to say', () => {
    // Null, so a caller cannot render an empty credit bar and read it as
    // "credited".
    expect(formatImageCredit({})).toBeNull();
    expect(formatImageCredit({ attribution: '  ', license: null })).toBeNull();
  });

  it('joins the parts it has', () => {
    expect(formatImageCredit({ attribution: 'A Photographer', license: 'CC BY 4.0' })).toBe(
      'A Photographer · CC BY 4.0',
    );
  });

  it('does not repeat the source when the licence already names it', () => {
    // "Pexels License · via Pexels" is a tautology.
    expect(
      formatImageCredit({ attribution: 'A', license: 'Pexels License', source: 'pexels' }),
    ).toBe('A · Pexels License');
    expect(
      formatImageCredit({ attribution: 'A', license: 'CC BY-SA 4.0', source: 'wikimedia' }),
    ).toBe('A · CC BY-SA 4.0 · via Wikimedia Commons');
  });

  it('labels the P18 source as Commons, which is where the file actually lives', () => {
    expect(formatImageCredit({ attribution: 'A', license: 'CC0', source: 'wikidata:p18' })).toBe(
      'A · CC0 · via Wikimedia Commons',
    );
  });
});
