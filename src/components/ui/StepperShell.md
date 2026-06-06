# `StepperShell`

Source: [`StepperShell.tsx`](./StepperShell.tsx)

## Purpose

A full-page multi-step layout shell (onboarding, wizards). Renders a step
indicator, the current step body with enter/exit transitions, and a sticky
prev/next/skip footer. Two visual modes for two emotional registers.

## Variants

| Variant | Use when | Indicator |
|---------|----------|-----------|
| `celebrate` (default) | upbeat onboarding | vertical sidebar with numbered/✓ nodes + [`AnimatedBeamConnector`](./AnimatedBeamConnector.md); mobile progress pills; full motion |
| `discreet` | sensitive flows (Intimate) | dense `01 / 06` line counter + a 1px progress bar; minimal motion |

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `steps` | `StepperStep[]` | — | `{ id, label, description? }[]` |
| `current` | `number` | — | zero-based active index |
| `onPrev` / `onNext` / `onSkip` | `() => void` | — | nav handlers |
| `nextLabel` / `prevLabel` / `skipLabel` | `string` | `Next` / `Back` / `Skip` | button copy |
| `canGoNext` / `canGoPrev` | `boolean` | `true` | enable/disable nav |
| `showSkip` | `boolean` | `false` | render the skip button |
| `variant` | `'celebrate' \| 'discreet'` | `'celebrate'` | visual mode (above) |
| `footerExtra` | `ReactNode` | — | extra footer slot beside Next |
| `children` | `ReactNode` | — | current step body |
| `className` | `string` | — | extra classes on the root |

## States

Per step node: `done` (filled, ✓), `active` (outlined, bold label + description),
`pending` (muted). Body crossfades/slides on `current` change via `AnimatePresence`.
Prev disabled at step 0; Next disabled when `!canGoNext`.

## Accessibility

- Sidebar is an ordered list (`<ol>`); body is `<main>`.
- Nav buttons are real `Button`s with text labels.
- `discreet` mode minimizes decorative motion for sensitive contexts; both modes
  should be paired with `prefers-reduced-motion` handling at the page level.

## Do / Don't

- **Do** pick `discreet` for privacy/intimate flows — no celebration there.
- **Do** drive `current` from your own step state; this is a controlled shell.
- **Don't** hide the step labels — they're the screen-reader progress cue.

## Example

```tsx
import { StepperShell } from '@/components/ui/StepperShell';

<StepperShell steps={STEPS} current={i} variant="celebrate"
  onPrev={back} onNext={next} canGoNext={valid}>
  {renderStep(i)}
</StepperShell>
```
