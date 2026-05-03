# `src/components/ui/` — design system primitives

These are shadcn/ui-style components built on Radix primitives and
styled with Tailwind. Import from `@/components/ui/<name>`.

## Rules

- **Import from `@/components/ui/<name>`** for the wrapped primitives
  (Button, Card, Badge, Input, Dialog, Alert, Avatar, etc.).
- **Stay flat.** All wrappers must satisfy `flat-compliance.test.tsx`:
  `borderRadius: 0`, `boxShadow: 'none'`, no borders. If a design
  needs a shadow, the design is wrong, not the component.
- **No hardcoded colors.** Use CSS custom properties
  (`hsl(var(--brand))`, `bg-foreground`, …). The ESLint
  `no-restricted-syntax` rule warns on hex/rgb/hsl literals.

## Where to look

- `card.tsx` — Card, CardHeader, CardImage. CardImage owns the
  brand-color image fallback used by every list page.
- `button.tsx` — variants × sizes.
- `EmptyState.tsx` — the standard for "no data" / "filtered to zero"
  states. Always pass an icon.
- `__tests__/flat-compliance.test.tsx` — guard against anyone
  resurrecting radii or shadows.
