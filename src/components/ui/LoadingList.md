# `LoadingList`

Source: [`LoadingList.tsx`](./LoadingList.tsx)

## Purpose

P6-2 skeleton grid for list pages (Venues, Events, News, Marketplace,
…). Renders placeholder cards in the same fluid grid the real content
uses, so the layout doesn't jump when data arrives.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `count` | `number` | `12` | Number of skeleton cards to render. |
| `minItemWidth` | `number` | `280` | Minimum card width (px) before the grid wraps. Match the real grid's `minmax`. |
| `itemHeight` | `number` | `280` | Approximate card height (px), including image + content. |

## States

Single state — the loading skeleton. Hand off to content via fade
(see `.content-crossfade-enter` in `index.css`) for a smooth swap.

## Accessibility

- `role="status"` + `aria-live="polite"` + `aria-label="Loading"` so
  screen readers announce the loading state without interrupting.
- Pulse animation respects `prefers-reduced-motion` via the global
  reduce-motion override in `index.css`.

## Do / Don't

- **Do** pair with `ErrorRetry` (failure) and `EmptyState` (no data)
  for the canonical fetch trio.
- **Do** match `minItemWidth` to the real grid so cards don't reflow.
- **Don't** show LoadingList for sub-second loads — flash of skeleton
  is worse than no skeleton. Gate behind a 200ms delay if needed.
- **Don't** customize per-card content; this is intentionally generic
  to keep the placeholder cheap.

## Example

```tsx
import { LoadingList } from '@/components/ui/LoadingList';

{isLoading ? <LoadingList count={9} minItemWidth={320} /> : <VenueGrid items={data} />}
```
