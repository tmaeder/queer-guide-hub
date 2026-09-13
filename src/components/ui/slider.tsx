import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

/**
 * ARIA GOES ON THE THUMB, NOT THE ROOT.
 *
 * `role="slider"` is carried by `SliderPrimitive.Thumb` — that is the element
 * assistive tech announces and the only one that takes focus. Radix does NOT
 * forward Root's aria-* down to it, so an `aria-label` passed to this component
 * landed on a plain wrapper `<div>` and the focusable slider had NO ACCESSIBLE
 * NAME (WCAG 4.1.2). Radix's own docs put the label on `<Slider.Thumb>` for
 * exactly this reason.
 *
 * Measured on prod 2026-09-12 via the podcast player: the `[role="slider"]`
 * element reported `aria-label: null` and `aria-valuetext: null` while the
 * caller was passing both. All five call sites in this repo that pass an
 * aria-label were equally nameless, which is why this is fixed here rather
 * than in one of them.
 *
 * Only the naming/value attributes move. Everything else — `aria-orientation`,
 * `aria-disabled`, `data-*`, layout props — stays on Root where Radix expects
 * it.
 */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(
  (
    {
      className,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-valuetext': ariaValueText,
      ...props
    },
    ref,
  ) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-valuetext={ariaValueText}
        className="block h-4 w-4 rounded-full bg-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
