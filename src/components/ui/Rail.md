# `Rail` / `RailItem`

Source: [`Rail.tsx`](./Rail.tsx)

## Purpose

A horizontally-scrolling carousel section with a title, optional subtitle/action,
and snap-scrolling items. Desktop shows prev/next chevron buttons that scroll by
~85% of the viewport width; mobile relies on touch + scroll-snap. Used for
"Featured venues", "Upcoming events" style rows.

## Exports

`Rail` (the section + scroller) · `RailItem` (a fixed-width snap child).

## `Rail` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | — | **required**; also becomes the section `aria-label` |
| `subtitle` | `string` | — | muted line under the title |
| `action` | `ReactNode` | — | right-aligned slot (e.g. "See all") |
| `compact` | `boolean` | — | hide the chevrons (content fits) |
| `className` | `string` | — | extra classes |

## `RailItem` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `'sm' \| 'md' \| 'lg'` | `'md'` | responsive fixed widths |
| `className` | `string` | — | extra classes |

## States

Chevrons hidden on mobile and when `compact`. Scroller uses `snap-x`,
`scroll-smooth`, thin scrollbar.

## Accessibility

- Wrapped in a labelled `<section aria-label={title}>`.
- Chevron buttons carry `aria-label="Scroll left/right"`.
- Items remain reachable by keyboard scroll/tab; chevrons are an enhancement,
  not the only way to move.

## Do / Don't

- **Do** wrap each child in `RailItem` so widths/snap are consistent.
- **Do** set `compact` when the row rarely overflows.
- **Don't** put critical actions only behind the chevrons (touch users scroll instead).

## Example

```tsx
import { Rail, RailItem } from '@/components/ui/Rail';

<Rail title="Featured venues" subtitle="Hand-picked" action={<a href="/venues">See all</a>}>
  {venues.map(v => <RailItem key={v.id}><VenueCard venue={v} /></RailItem>)}
</Rail>
```
