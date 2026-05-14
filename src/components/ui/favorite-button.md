# `favorite-button`

Source: [`favorite-button.tsx`](./favorite-button.tsx)

## Purpose

One-line: shadcn-as-MUI wrapper for the `favorite-button` primitive. See
`src/components/ui/README.md` for the wrapper architecture.

## Variants

See the component source for `variant`, `size`, and other prop
options. The shadcn API surface is preserved; the underlying
implementation uses MUI 7.

## States

Default · hover · active · focus · disabled. Loading where applicable.

## Accessibility

- Ships with MUI's keyboard + ARIA defaults.
- All interactive variants meet WCAG 2.2 AA when used with the
  default theme. Verified by `e2e/a11y-public-routes.spec.ts` and
  per-component vitest tests in `__tests__/`.

## Do / Don't

- **Do** import from `@/components/ui/favorite-button`.
- **Do** stay flat: zero radius, zero shadow, zero border. Enforced
  by `__tests__/flat-compliance.test.tsx` for the canonical
  primitives.
- **Don't** import the underlying MUI component directly when this
  wrapper exists.
- **Don't** introduce hardcoded color literals — use theme tokens
  (`theme.palette.*`) or CSS variables (`hsl(var(--foreground))`).

## Example

```tsx
import { /* exports */ } from '@/components/ui/favorite-button';

// minimal usage — see source for the full prop surface.
```
