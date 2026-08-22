/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { BrandMark } from '../BrandMark';

describe('BrandMark', () => {
  it('renders the monogram when there is no logo', () => {
    const { container, getByText } = render(<BrandMark name="Big Bud Press" logoUrl={null} />);
    expect(getByText('BB')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps the monogram UNDER the logo, so a dead logo URL degrades to it', () => {
    // The whole point of layering rather than branching: no error handler, no
    // state, and a purged R2 object leaves the plate reading as a monogram
    // instead of as a broken image.
    const { container, getByText } = render(
      <BrandMark name="cherrykitten" logoUrl="https://img.queer.guide/logos/abc.png" />,
    );
    expect(getByText('C')).toBeTruthy();
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://img.queer.guide/logos/abc.png');
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('hides the monogram behind a logo — transparent PNGs show it through', () => {
    // Found on prod: cherrykitten's pink wordmark is transparent, and the ink
    // "C" underneath sat inside its counters.
    const { getByText } = render(<BrandMark name="cherrykitten" logoUrl="https://x/l.png" />);
    expect(getByText('C').className).toContain('invisible');
  });

  it('hides a failed logo and brings the monogram back', () => {
    // The monogram sitting underneath is not enough on its own: Chrome paints
    // its torn-page glyph over the plate for a broken image even with alt="".
    const { container, getByText } = render(
      <BrandMark name="cherrykitten" logoUrl="https://x/dead.png" />,
    );
    const img = container.querySelector('img')!;
    expect(img.style.display).toBe('');
    fireEvent.error(img);
    expect(img.style.display).toBe('none');
    expect(getByText('C').style.visibility).toBe('visible');
  });

  it('never crops the logo — a brand mark is a fixed composition', () => {
    const { container } = render(<BrandMark name="TomboyX" logoUrl="https://x/l.png" />);
    const cls = container.querySelector('img')?.className ?? '';
    expect(cls).toContain('object-contain');
    expect(cls).not.toContain('object-cover');
  });

  it('lets the caller own the plate size and the monogram rank', () => {
    const { container, getByText } = render(
      <BrandMark
        name="Nasty Pig"
        logoUrl={null}
        className="h-20 w-20 rounded-container"
        monogramClassName="font-display text-headline"
      />,
    );
    expect(container.firstElementChild?.className).toContain('h-20');
    expect(getByText('NP').className).toContain('font-display');
  });
});
