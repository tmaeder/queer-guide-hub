/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BentoSection, spansForPreset } from '../BentoSection';

describe('spansForPreset', () => {
  it("returns 'sm' for the uniform preset regardless of index", () => {
    expect(spansForPreset('uniform', 0, 10)).toBe('sm');
    expect(spansForPreset('uniform', 5, 10)).toBe('sm');
  });

  it("returns FEATURED_PATTERN[0] = 'wide' for index 0", () => {
    expect(spansForPreset('featured', 0, 10)).toBe('wide');
  });

  it("returns 'sm' once past the pattern length", () => {
    expect(spansForPreset('featured', 50, 100)).toBe('sm');
    expect(spansForPreset('mosaic', 50, 100)).toBe('sm');
  });
});

describe('BentoSection', () => {
  it("renders a grid with data-bento-preset='mosaic' by default", () => {
    render(<BentoSection><div>child</div></BentoSection>);
    expect(screen.getByText('child').parentElement).toHaveAttribute('data-bento-preset', 'mosaic');
  });

  it('honors explicit preset', () => {
    render(<BentoSection preset="featured"><div>x</div></BentoSection>);
    expect(screen.getByText('x').parentElement).toHaveAttribute('data-bento-preset', 'featured');
  });
});
