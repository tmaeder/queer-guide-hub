# `src/components/ui/` — design system primitives

These look like shadcn/ui. They aren't. They are **MUI 7 components
wearing the shadcn/ui API** so consumers get the imports and prop
shapes they expect (`<Button variant="default" size="sm">`,
`<Card hoverable>`, …) while the underlying widgets stay on top of
MUI's accessibility, theming, and behaviors.

## Why this hybrid

We chose MUI for the engineered behaviors (focus management, dialog
trapping, popper positioning, slot APIs, theme tokens) and shadcn's
ergonomic surface for everything else. Re-exporting MUI directly
would leak MUI's prop shapes into every component file; cloning
shadcn outright would forfeit MUI's runtime guarantees. The wrapper
layer gives us both.

## Rules

- **Import from `@/components/ui/<name>`**, never from `@mui/material`
  for things that have a wrapper (Button, Card, Badge, Input, Dialog,
  Alert, Avatar, etc.). Use raw MUI only for primitives the wrapper
  layer does not own (Box, Container, Typography, IconButton).
- **Add a wrapper** when you find yourself reaching for a MUI
  component a third time across the app and it could use the shadcn
  ergonomics. Don't add one for a single use.
- **Stay flat.** All wrappers must satisfy `flat-compliance.test.tsx`:
  `borderRadius: 0`, `boxShadow: 'none'`, no borders. If a design
  needs a shadow, the design is wrong, not the component.
- **No hardcoded colors.** Use theme tokens (`theme.palette.*`) or
  CSS custom properties (`hsl(var(--brand))`). The ESLint
  `no-restricted-syntax` rule warns on hex/rgb/hsl literals.

## Where to look

- `card.tsx` — Card, CardHeader, CardImage. CardImage owns the
  brand-color image fallback used by every list page.
- `button.tsx` — 7 variants × 4 sizes. Add `loading` (P6-1) only if
  you genuinely need it; otherwise compose with `<Loading>`.
- `EmptyState.tsx` — the standard for "no data" / "filtered to zero"
  states. Always pass an icon.
- `__tests__/flat-compliance.test.tsx` — guard against anyone
  resurrecting radii or shadows.

## When to escape the layer

If MUI's component has a slot or prop you need that isn't on the
wrapper, add it to the wrapper rather than reaching past it. Loose
imports of `@mui/material/Button` defeat the point.
