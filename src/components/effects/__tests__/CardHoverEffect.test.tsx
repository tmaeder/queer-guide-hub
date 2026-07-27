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
    // group-hover, not hover — the pointer never reaches the Card itself.
    expect(card?.className).toContain('group-hover:bg-muted/40');
    expect(card?.className).not.toMatch(/(^|\s)hover:bg-muted\/40/);
  });
});
