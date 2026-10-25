# `badge`

Source: [`badge.tsx`](./badge.tsx)

## Purpose

One-line: shadcn-as-MUI wrapper for the `badge` primitive. See
`src/components/ui/README.md` for the wrapper architecture.

## Variants

The ONE badge implementation. Domain badges (`UserModeBadge`,
`MilestoneCategoryBadge`, booking/confidence/count marks) pick a variant
here instead of hand-rolling classes. On an element that must stay inline
(inside `<p>`, `<span>`, a positioned overlay) use
`badgeVariants({ variant })` on your own `<span>`; `<Badge>` renders a `div`.

| Variant | Rank | Use |
|---|---|---|
| `default` `outline` `soft` `ink` `secondary` `destructive` | chip (12px radius, 11px uppercase) | labels on cards and rows |
| `mark` `mark-solid` `mark-dashed` | badge (9px radius, 10px) | status marks in dense rows |
| `count` `count-alert` | badge | numeric counts in nav rows |
| `overlay` | badge | "Featured" over a card image (position via className) |
| `pill` | full | icon + label (user mode); size via className |
| `plate` | container | raised paper plate (milestone category) |

## States

Default · hover · active · focus · disabled. Loading where applicable.

## Accessibility

- Ships with MUI's keyboard + ARIA defaults.
- All interactive variants meet WCAG 2.2 AA when used with the
  default theme. Verified by `e2e/a11y-public-routes.spec.ts` and
  per-component vitest tests in `__tests__/`.

## Do / Don't

- **Do** import from `@/components/ui/badge`.
- **Do** take radius from the semantic trio (`rounded-container`/
  `rounded-element`/`rounded-badge`) and avoid the soft `shadow-*`
  ramp. Enforced by `__tests__/token-compliance.test.tsx` for the
  canonical primitives.
- **Don't** import the underlying MUI component directly when this
  wrapper exists.
- **Don't** introduce hardcoded color literals — use theme tokens
  (`theme.palette.*`) or CSS variables (`hsl(var(--foreground))`).

## Example

```tsx
import { Badge, badgeVariants } from '@/components/ui/badge';

<Badge variant="outline">Open</Badge>
<span className={badgeVariants({ variant: 'mark' })}>Visited</span>
```
