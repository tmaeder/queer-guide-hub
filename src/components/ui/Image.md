# `Image`

Source: [`Image.tsx`](./Image.tsx)

## Purpose

The single image primitive for every card and hero on the site — replaces ~30
hand-rolled `<img>` blocks. Wires the shared image utilities so every surface
gets the same treatment: source resolution (R2 optimized → thumbnail →
original), responsive Cloudflare `srcset`, host-aware `referrerPolicy`,
lazy/eager loading by priority, a fade-in with an 8s stall guard, and a
deterministic on-brand fallback (stable per entity — no reshuffle on reload).

Cohesion comes from a small fixed set of aspect ratios + a 3-tier scrim, **not**
desaturation. Images render in full color.

## Key props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `alt` | `string` | — | **required** alt text |
| `src` | `string \| null` | — | pre-resolved URL escape hatch (wins over `*Url`) |
| `imageUrl` / `optimizedUrl` / `thumbnailUrl` | `string \| null` | — | source candidates for `resolveImageUrl` |
| `preferThumb` | `boolean` | — | prefer the thumbnail variant |
| `fallbackEntityType` | `FallbackTheme` | `'default'` | themed fallback family |
| `fallbackKey` | `string` | — | stable id/slug → deterministic fallback |
| `fallbackIcon` | `LucideIcon` | — | render an icon tile instead of a photo when missing |
| `aspect` | `'card'\|'hero'\|'portrait'\|'thumb'\|'square'\|'auto'` | `'card'` | aspect ratio token |
| `heightPx` | `number` | — | fixed-height escape hatch (overrides `aspect`) |
| `imageRole` | `'cover'\|'hero'\|'thumb'\|'avatar'` | `'cover'` | drives default widths + sizes |
| `scrim` | `'none'\|'readable'\|'strong'` | `'none'` | black readability scrim over image |
| `priority` | `boolean` | `false` | eager + `fetchpriority=high` for above-the-fold |
| `rounded` | `'container'\|'element'\|'top'\|'none'` | `'top'` | corner token |
| `objectPosition` | `string` | — | focal point |
| `sizes` / `widths` | `string` / `number[]` | per role | responsive overrides |
| `children` | `ReactNode` | — | overlay slot (badges, favorite button) |

## States

Loading (muted box, image fades in via `img-lazy-fade` → `.loaded`) · loaded ·
error/stall (8s guard → deterministic fallback image, or icon tile if
`fallbackIcon`) · hover (zoom `scale-[1.04]` when inside a `group` ancestor).

## Accessibility

- `alt` is required (enforced by `jsx-a11y/alt-text`). Use `alt=""` only for
  purely decorative images.
- Named `imageRole` prop avoids colliding with the ARIA `role` attribute.
- Scrim and overlay are `pointer-events-none` / `aria-hidden` where decorative.

## Do / Don't

- **Do** pass `fallbackKey` (entity id/slug) so the fallback is stable.
- **Do** set `priority` only for the LCP/hero image.
- **Don't** drop a raw `<img>` — use this so optimization + fallback come for free.

## Example

```tsx
import { Image } from '@/components/ui/Image';

<Image imageUrl={venue.image} fallbackEntityType="venue" fallbackKey={venue.id}
       alt={venue.name} aspect="card" scrim="readable" rounded="top" />
```
