# `TierUpgradeOverlay`

Source: [`TierUpgradeOverlay.tsx`](./TierUpgradeOverlay.tsx)

## Purpose

A full-screen celebration moment shown when a user advances a trust tier. A
blurred backdrop fades in, the tier badge spring-scales with a ripple, eight
sparkle particles fan out, and it auto-dismisses. The one place decorative
"delight" motion is intentional.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | — | mount/animate the overlay |
| `tierName` | `string` | — | **required**; the unlocked tier name |
| `tagline` | `string` | — | supporting line under the name |
| `icon` | `ReactNode` | `<Sparkles/>` | badge glyph |
| `onDismiss` | `() => void` | — | called on click, Continue, or auto-dismiss |
| `autoDismissMs` | `number` | `4200` | auto-close delay; `0` disables |

## States

Closed (unmounted via `AnimatePresence`) · entering (backdrop blur-in, badge
spring + ripple, staggered sparkle burst, text rises in) · open (idle) ·
dismissing (fade + scale out). Auto-dismisses after `autoDismissMs` unless `0`.

## Accessibility

- Root is `role="dialog"` with `aria-label={`Tier upgrade: ${tierName}`}`.
- Dismiss on backdrop click and via the explicit **Continue** button; inner
  content stops propagation so clicks inside don't close it.
- Sparkles are decorative; the heading + tagline carry the message.
- Consider gating/limiting motion for `prefers-reduced-motion` at the call site.

## Do / Don't

- **Do** reserve this for genuine milestone moments — overuse cheapens it.
- **Do** keep `tagline` short; it's a celebration, not a settings page.
- **Don't** put required actions only inside it — it auto-dismisses.

## Example

```tsx
import { TierUpgradeOverlay } from '@/components/ui/TierUpgradeOverlay';

<TierUpgradeOverlay open={leveledUp} tierName="Local Guide"
  tagline="You can now publish venue edits." onDismiss={() => setLeveledUp(false)} />
```
