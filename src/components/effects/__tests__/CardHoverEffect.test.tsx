/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Card } from '@/components/ui/card';
import { CardHoverEffect } from '../CardHoverEffect';

describe('CardHoverEffect', () => {
  it('renders empty', () => {
    const { container } = render(<CardHoverEffect items={[]} />);
    expect(container).toBeTruthy();
  });

  // These cards put their click target in an absolutely-positioned overlay link
  // that is a SIBLING of the Card. The overlay covers the Card, so the pointer
  // never enters the Card's own hover chain — `hover:` on the Card silently
  // never fires and the card goes visually inert. Only an ancestor of the
  // overlay still sees the hover, and this wrapper is that ancestor, so it must
  // carry `group`. Verified in a real browser: without it, hovering a /venues
  // card left background and border unchanged.
  it('carries `group` so a sibling overlay link can drive card hover', () => {
    const { container } = render(<CardHoverEffect>x</CardHoverEffect>);
    expect(container.firstElementChild?.className).toContain('group');
  });

  it('pairs with `hoverable="group"` to keep the hover reachable', () => {
    const { container } = render(
      <CardHoverEffect>
        <Card hoverable="group">card</Card>
        <a href="/x" className="absolute inset-0 no-underline" aria-label="open" />
      </CardHoverEffect>,
    );
    const card = container.firstElementChild?.firstElementChild;
    // Assert the MECHANISM, not the palette. This used to pin the literal
    // `group-hover:bg-muted/40`, which broke the moment the PASTE-UP pass
    // repainted cards as ink plates even though the behaviour it guards was
    // untouched. What must hold is that the hover state is group-scoped —
    // a bare `hover:` on the Card can never fire, because the sibling overlay
    // link covers it and the pointer never enters the Card's own hover chain.
    expect(card?.className).toMatch(/group-hover:bg-\S+/);
    expect(card?.className).not.toMatch(/(^|\s)hover:bg-\S+/);
  });

  // The off-register second plate lives on the WRAPPER, not the Card: entity
  // cards pass `overflow-hidden` to clip their cover image, which would clip
  // the offset plate out of existence.
  it('prints the misregistered plate on the wrapper, and lets callers opt out', () => {
    const { container: inked } = render(<CardHoverEffect>x</CardHoverEffect>);
    expect(inked.firstElementChild?.className).toContain('plate-offset');

    const { container: plain } = render(<CardHoverEffect ink="none">x</CardHoverEffect>);
    expect(plain.firstElementChild?.className).not.toContain('plate-offset');
  });
});
