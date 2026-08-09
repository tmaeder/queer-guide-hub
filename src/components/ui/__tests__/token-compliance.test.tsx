import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Button } from '../button';
import { Card } from '../card';
import { Badge } from '../badge';
import { Input } from '../input';
import { Alert, AlertTitle } from '../alert';

/**
 * Token compliance for the shadcn wrappers.
 *
 * This file was `flat-compliance.test.tsx` and asserted on `getComputedStyle`:
 *
 *     expect(['0px', '']).toContain(cs.borderRadius);
 *     expect(['none', '']).toContain(cs.boxShadow);
 *
 * It could never fail. `src/test/setup.ts` does not import `src/index.css` and
 * jsdom does not run Tailwind, so both properties compute to `''` on every
 * element — which the `''` branch accepts. Measured, not assumed: a
 * `<Button className="shadow-2xl rounded-3xl">` passed all five assertions.
 * Five green tests, zero coverage, for as long as the file existed.
 *
 * The fix is to measure the thing that actually exists in jsdom — the class
 * string — rather than a computed style that will always be empty. Anything
 * needing real layout belongs in `e2e/design-system.spec.ts`, which runs in a
 * browser against real CSS and IS wired into `e2e-pr.yml`.
 *
 * `assertsSomething` below is the guard for the guard: it feeds the matchers a
 * deliberately non-compliant class string and requires them to reject it. That
 * is what would have caught the vacuous version on the day it was written, and
 * it is why this file cannot rot the same way twice.
 */

/** The Tailwind soft-elevation ramp. Banned: depth is a hard offset plate. */
const SOFT_SHADOW = /\bshadow-(sm|md|lg|xl|2xl)\b/;

/**
 * Non-semantic radius. The contract is the trio — `rounded-container` (cards,
 * sheets, dialogs), `rounded-element` (buttons, inputs, rows),
 * `rounded-badge` (chips, pills). `rounded-full` and `rounded-none` stay legal
 * (avatars/dots, explicit flat override), so they are absent here on purpose.
 */
const NON_SEMANTIC_RADIUS = /\brounded-(xs|sm|md|lg|xl|2xl|3xl|4xl)\b|(?:^|\s)rounded(?![-\w])/;

const SEMANTIC_RADIUS = /\brounded-(container|element|badge|full|none|t-container)\b/;

function classOf(el: Element): string {
  return el.getAttribute('class') ?? '';
}

function expectTokenCompliant(el: Element, label: string) {
  const cls = classOf(el);

  // Meta-assertion. Without it, a refactor that stops emitting classes turns
  // every check below into a vacuous pass on an empty string — the exact
  // failure mode this file is a rewrite of.
  expect(
    cls,
    `${label} emitted no classes at all — the assertions below would be vacuous`,
  ).not.toBe('');

  expect(cls, `${label}: soft elevation is banned, depth is a hard offset plate`).not.toMatch(
    SOFT_SHADOW,
  );
  expect(cls, `${label}: radius must come from the semantic trio`).not.toMatch(NON_SEMANTIC_RADIUS);
  expect(cls, `${label}: no semantic radius token present`).toMatch(SEMANTIC_RADIUS);
}

describe('design-system token compliance', () => {
  it('the matchers actually reject a non-compliant class string', () => {
    // Guard for the guard. If this ever passes, the matchers have gone toothless
    // and every assertion in this file is decoration.
    const bad = 'inline-flex shadow-2xl rounded-3xl px-6';
    expect(bad).toMatch(SOFT_SHADOW);
    expect(bad).toMatch(NON_SEMANTIC_RADIUS);
    expect(bad).not.toMatch(SEMANTIC_RADIUS);

    // And the real primitive, wearing the same bad classes, must be rejected.
    const { container } = render(<Button className="shadow-2xl rounded-3xl">x</Button>);
    expect(() => expectTokenCompliant(container.querySelector('button')!, 'Button')).toThrow();
  });

  it('Button uses design tokens', () => {
    const { container } = render(<Button>x</Button>);
    expectTokenCompliant(container.querySelector('button')!, 'Button');
  });

  it('Card uses design tokens', () => {
    const { container } = render(<Card>x</Card>);
    expectTokenCompliant(container.firstElementChild!, 'Card');
  });

  it('Badge uses design tokens', () => {
    const { container } = render(<Badge>x</Badge>);
    expectTokenCompliant(container.firstElementChild!, 'Badge');
  });

  it('Input uses design tokens', () => {
    const { container } = render(<Input />);
    expectTokenCompliant(container.querySelector('input')!, 'Input');
  });

  it('Alert uses design tokens', () => {
    const { container } = render(
      <Alert>
        <AlertTitle>x</AlertTitle>
      </Alert>,
    );
    expectTokenCompliant(container.firstElementChild!, 'Alert');
  });
});
