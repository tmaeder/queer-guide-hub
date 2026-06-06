# `MotionCard`

Source: [`MotionCard.tsx`](./MotionCard.tsx)

## Purpose

A `Card` that tints its background on hover (`muted/40`) with a snappy spring.
Lives in its own file so consumers of the plain `card` don't pull
`motion/react` into their bundle. Use for interactive content tiles where a
subtle hover affordance helps.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `hoverable` | `boolean` | — | (reserved) |
| `className` | `string` | — | extra classes |
| …rest | `HTMLAttributes<HTMLDivElement>` | — | forwarded |

Forwards a `ref`.

## Visual / States

`bg-card`, `rounded-container`, `border-border/60`. Hover → `backgroundColor`
animates to `hsl(var(--muted) / 0.4)` via `springs.snappy`.

## Accessibility

- Respects `prefers-reduced-motion`: when reduced, the hover animation is
  dropped entirely (no tint transition).
- It's a presentational container — add `role`/handlers on the consumer if the
  whole card is a click target, and ensure a focusable element inside.

## Do / Don't

- **Do** use it only where the hover tint communicates interactivity.
- **Don't** use it in the admin tree — admin is motion-free (ESLint blocks
  `motion/react` there); use plain `card` instead.

## Example

```tsx
import { MotionCard } from '@/components/ui/MotionCard';

<MotionCard className="p-6"><h3>Trip to Lisbon</h3></MotionCard>
```
