import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Wordmark } from '@/components/brand/Wordmark';

/**
 * The MasterSymbol cases that used to live here went with the component on
 * 2026-08-19: the design project's brand rules retire the "Cupid's transit"
 * mark, so the wordmark is the whole of the logo. What the mark's renditions
 * still need pinning for is covered by brandAssetSync.test.ts.
 */
describe('brand', () => {
  it('Wordmark reads queer.guide', () => {
    render(<Wordmark />);
    expect(screen.getByText('queer.guide')).toBeInTheDocument();
  });

  it('Wordmark is lowercase, with the dot, and takes no colour', () => {
    // Brand Guidelines §03, "One case": always lowercase, always with the dot.
    // Never "queer guide", never "Queer.Guide", never all caps. And the mark
    // carries no colour of its own — it inherits ink or paper from its context.
    const { container } = render(<Wordmark />);
    const el = container.firstElementChild!;
    expect(el.textContent).toBe('queer.guide');
    expect(el.className).toContain('lowercase');
    expect(el.className).not.toMatch(/text-track-|text-\[#/);
  });
});
