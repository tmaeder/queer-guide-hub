import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Button } from '../button';
import { Card } from '../card';
import { Badge } from '../badge';
import { Input } from '../input';
import { Alert, AlertTitle } from '../alert';

// P2-4 — flat-compliance assertions for the design system.
// Per CLAUDE.md: 0 radius, 0 borders, 0 shadows on the canonical
// shadcn-as-MUI wrappers. If you intentionally break flatness, this
// test SHOULD fail — update the design contract first.

function readStyle(el: Element) {
  const cs = getComputedStyle(el);
  return {
    borderRadius: cs.borderRadius,
    boxShadow: cs.boxShadow,
    borderWidth: cs.borderTopWidth, // borders are uniform
  };
}

describe('design-system flat compliance', () => {
  it('Button renders with no radius / shadow / border', () => {
    const { container } = render(<Button>x</Button>);
    const btn = container.querySelector('button')!;
    const s = readStyle(btn);
    expect(s.borderRadius).toBe('0px');
    expect(s.boxShadow === 'none' || s.boxShadow === '').toBe(true);
  });

  it('Card renders flat', () => {
    const { container } = render(<Card>x</Card>);
    const card = container.firstElementChild!;
    const s = readStyle(card);
    expect(s.borderRadius).toBe('0px');
    expect(s.boxShadow === 'none' || s.boxShadow === '').toBe(true);
  });

  it('Badge renders flat', () => {
    const { container } = render(<Badge>x</Badge>);
    const b = container.firstElementChild!;
    expect(readStyle(b).borderRadius).toBe('0px');
  });

  it('Input renders flat', () => {
    const { container } = render(<Input />);
    const i = container.querySelector('input')!;
    expect(readStyle(i).borderRadius).toBe('0px');
  });

  it('Alert renders flat', () => {
    const { container } = render(
      <Alert>
        <AlertTitle>x</AlertTitle>
      </Alert>,
    );
    const a = container.firstElementChild!;
    expect(readStyle(a).borderRadius).toBe('0px');
  });
});
