# `hover-card`

Source: [`hover-card.tsx`](./hover-card.tsx)

## Purpose

Pointer-triggered preview card built on `@radix-ui/react-hover-card`. Shows a
floating panel on hover/focus of its trigger — for rich link previews (a
personality, a venue) that would be too much for a tooltip.

## Exports

`HoverCard` (Root) · `HoverCardTrigger` · `HoverCardContent`.

## Props

`HoverCardContent` extends the Radix Content props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `align` | `'start' \| 'center' \| 'end'` | `'center'` | edge alignment to trigger |
| `sideOffset` | `number` | `4` | gap (px) from the trigger |

Width defaults to `w-64`; override with `className`.

## States

Open (`data-state=open`, `fade-in-0` + `animate-in`) · closed (`fade-out-0` +
`animate-out`). Opens on hover and on keyboard focus of the trigger.

## Visual

`rounded-element`, hairline `border-foreground/15`, solid `bg-background`,
`p-3`. No shadow — depth via border only (design system).

## Accessibility

- Radix manages open/close on hover **and** focus, with safe open/close delays.
- Not a substitute for a click target — keep the real link/action focusable.

## Do / Don't

- **Do** use for supplementary preview content, not essential actions.
- **Don't** put the only path to an action inside a hover card (unreachable on touch).

## Example

```tsx
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';

<HoverCard>
  <HoverCardTrigger asChild><a href="/p/marsha-p-johnson">Marsha P. Johnson</a></HoverCardTrigger>
  <HoverCardContent>Activist, 1945–1992. Stonewall veteran.</HoverCardContent>
</HoverCard>
```
