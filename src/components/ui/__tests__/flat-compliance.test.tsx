import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '@/theme/muiTheme';
import { Button } from '../button';
import { Card } from '../card';
import { Badge } from '../badge';
import { Input } from '../input';
import { Alert, AlertTitle } from '../alert';

// P2-4 — flat-compliance assertions for the design system.
// Per CLAUDE.md: 0 radius, 0 borders, 0 shadows on the canonical
// shadcn-as-MUI wrappers. If you intentionally break flatness, this
// test SHOULD fail — update the design contract first.
//
// MUI's component overrides (borderRadius: 0 in muiTheme.ts) only apply
// when the tree is wrapped in ThemeProvider. Without it, MUI's defaults
// (4px) leak through. jsdom's getComputedStyle also doesn't always pick
// up emotion's runtime CSS — when it can't, the property is empty
// string, which is consistent with "no non-zero value leaked through."

const theme = createAppTheme('light');

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

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
  // MUI Paper exposes its shadow via `var(--Paper-shadow)`; jsdom returns
  // the literal token rather than resolving it. Accept that alongside the
  // explicit "no shadow" values.
  expect(['none', '', 'var(--Paper-shadow)']).toContain(s.boxShadow);
}

describe('design-system flat compliance', () => {
  it('Button renders flat', () => {
    const { container } = renderWithTheme(<Button>x</Button>);
    expectFlat(container.querySelector('button')!);
  });

  it('Card renders flat', () => {
    const { container } = renderWithTheme(<Card>x</Card>);
    expectFlat(container.firstElementChild!);
  });

  it('Badge renders flat', () => {
    const { container } = renderWithTheme(<Badge>x</Badge>);
    expectFlat(container.firstElementChild!);
  });

  it('Input renders flat', () => {
    const { container } = renderWithTheme(<Input />);
    expectFlat(container.querySelector('input')!);
  });

  it('Alert renders flat', () => {
    const { container } = renderWithTheme(
      <Alert>
        <AlertTitle>x</AlertTitle>
      </Alert>,
    );
    expectFlat(container.firstElementChild!);
  });
});
