# `src/components/ui/` — design system primitives

These are shadcn/ui-style components built on Radix primitives and
styled with Tailwind. Import from `@/components/ui/<name>`.

## Rules

- **Import from `@/components/ui/<name>`** for the wrapped primitives
  (Button, Card, Badge, Input, Dialog, Alert, Avatar, etc.).
- **Use soft, borderless surfaces.** All wrappers must satisfy
  `token-compliance.test.tsx`: semantic radii only, no decorative frames,
  and only the shared `shadow-soft` elevation family. Hierarchy comes from
  spacing, tonal fills, type, and focus state.
- **No hardcoded colors.** Use CSS custom properties
  (`hsl(var(--foreground))`, `bg-foreground`, …). The ESLint
  `no-restricted-syntax` rule warns on hex/rgb/hsl literals.

## Where to look

- `card.tsx` — Card, CardHeader, CardImage. CardImage owns the
  brand-color image fallback used by every list page.
- `button.tsx` — variants × sizes.
- `EmptyState.tsx` — the standard for "no data" / "filtered to zero"
  states. Always pass an icon.
- `__tests__/token-compliance.test.tsx` — guard against square corners,
  decorative frames, or a competing shadow/radius system.
