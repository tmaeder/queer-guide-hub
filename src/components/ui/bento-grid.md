# `bento-grid`

Source: [`bento-grid.tsx`](./bento-grid.tsx)

## Purpose

A 12-column "bento" layout: cells of varying span sit on a shared hairline
grid (`gap-px bg-border`) so dividers read as a single 1px ruled sheet, not
floating cards. Used for dashboards and editorial mosaics.

## Exports

`BentoGrid` (the 12-col container) · `BentoCell` (one tile).

## `BentoCell` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `span` | `number` | `3` | column span (of 12) |
| `rowSpan` | `number` | `1` | row span |
| `title` | `ReactNode` | — | string → uppercase eyebrow `h3`; node → rendered as-is |
| `action` | `ReactNode` | — | right-aligned header slot |
| `interactive` | `boolean` | — | adds hover tint + cursor (needs `onClick`) |
| `onClick` | `() => void` | — | click handler; enables button role when `interactive` |
| `className` | `string` | — | extra classes on the cell |

## States

Static by default. When `interactive` **and** `onClick` are set: `hover:bg-muted/30`,
`cursor-pointer`, `role="button"`, `tabIndex=0`, and `Enter`/`Space` activate it.

## Accessibility

- Interactive cells get keyboard activation + button role only when both
  `interactive` and `onClick` are present; otherwise they stay inert `section`s.
- Provide a meaningful `title` so the cell is identifiable.

## Do / Don't

- **Do** keep spans summing to 12 per visual row.
- **Don't** set `onClick` without `interactive` — the cell won't be keyboard-reachable.
- **Don't** add borders to cells; the grid gap *is* the divider.

## Example

```tsx
import { BentoGrid, BentoCell } from '@/components/ui/bento-grid';

<BentoGrid>
  <BentoCell span={8} title="Trips">…</BentoCell>
  <BentoCell span={4} title="Saved" interactive onClick={openSaved}>…</BentoCell>
</BentoGrid>
```
