import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Button } from '../button';
import { Card } from '../card';
import { Badge } from '../badge';
import { Input } from '../input';
import { Alert, AlertTitle } from '../alert';

// Flat-compliance assertions for the design system.
// Per CLAUDE.md: 0 radius, 0 borders, 0 shadows on the shadcn wrappers.
// If you intentionally break flatness, this test SHOULD fail — update
// the design contract first.

function readStyle(el: Element) {
  const cs = getComputedStyle(el);
  return {
    borderRadius: cs.borderRadius,
    boxShadow: cs.boxShadow,
    borderWidth: cs.borderTopWidth,
  };
}

function expectFlat(el: Element) {
  const s = readStyle(el);
  expect(['0px', '']).toContain(s.borderRadius);
  expect(['none', '']).toContain(s.boxShadow);
}

describe('design-system flat compliance', () => {
  it('Button renders flat', () => {
    const { container } = render(<Button>x</Button>);
    expectFlat(container.querySelector('button')!);
  });

  it('Card renders flat', () => {
    const { container } = render(<Card>x</Card>);
    expectFlat(container.firstElementChild!);
  });

  it('Badge renders flat', () => {
    const { container } = render(<Badge>x</Badge>);
    expectFlat(container.firstElementChild!);
  });

  it('Input renders flat', () => {
    const { container } = render(<Input />);
    expectFlat(container.querySelector('input')!);
  });

  it('Alert renders flat', () => {
    const { container } = render(
      <Alert>
        <AlertTitle>x</AlertTitle>
      </Alert>,
    );
    expectFlat(container.firstElementChild!);
  });
});
