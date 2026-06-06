# `AnimatedBeamConnector`

Source: [`AnimatedBeamConnector.tsx`](./AnimatedBeamConnector.tsx)

## Purpose

A 1px connector line between step-indicator nodes. Inactive it's a muted
hairline; active it fills with the foreground color (draws in over 600ms) and
runs a faint travelling shimmer. Used by [`StepperShell`](./StepperShell.md).

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `active` | `boolean` | `false` | fills + animates when true |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | 1px column or 1px row |
| `className` | `string` | — | sizing/positioning (length, offset) |

## States

Inactive (`bg-border` track only) · active (foreground fill animates 0→100%
with `ease [0.22,1,0.36,1]`, plus an infinite shimmer span at 40% opacity).

## Visual

Track is `bg-border`; fill is `bg-foreground`. Width/height fixed to 1px on the
cross axis. Purely decorative — `aria-hidden`.

## Accessibility

- `aria-hidden` — conveys no information on its own; the step state is announced
  by the surrounding stepper labels.
- Honors reduced motion at the consumer level (StepperShell variants).

## Do / Don't

- **Do** size the length via `className` (e.g. `h-[calc(100%+1rem)]`).
- **Don't** use it as the sole indicator of progress — pair with text/number nodes.

## Example

```tsx
import { AnimatedBeamConnector } from '@/components/ui/AnimatedBeamConnector';

<AnimatedBeamConnector active={i < current} className="absolute left-[15px] top-8 h-[calc(100%+1rem)]" />
```
