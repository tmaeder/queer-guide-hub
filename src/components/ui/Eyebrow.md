# `Eyebrow`

Source: [`Eyebrow.tsx`](./Eyebrow.tsx)

## Purpose

The small uppercase kicker label above a heading or section. Single source of
truth for the eyebrow treatment: `text-2xs`, `font-semibold`, uppercase,
`tracking-label` (the +4% semantic label tracking), `text-muted-foreground`.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `as` | `'span' \| 'div' \| 'p'` | `'span'` | rendered element |
| `className` | `string` | — | extra classes |
| …rest | `HTMLAttributes` | — | forwarded to the element |

Forwards a `ref`.

## States

Static text. No interactive states.

## Accessibility

- Decorative kicker — keep the real semantic heading (`h1`–`h3`) separate; the
  eyebrow is not a heading element.
- Uppercasing is via CSS, so screen readers still read the original casing.

## Do / Don't

- **Do** use it for every section kicker so tracking/size/color stay consistent.
- **Don't** hand-roll `text-xs uppercase tracking-wide text-muted-foreground` —
  use this instead (it carries the design-system `tracking-label` token).

## Example

```tsx
import { Eyebrow } from '@/components/ui/Eyebrow';

<Eyebrow>Featured</Eyebrow>
<h2 className="text-headline">Pride in Berlin</h2>
```
