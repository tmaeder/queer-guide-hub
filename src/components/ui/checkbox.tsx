import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // min-h-0 beats the global 44px tap-target min-height (index.css), which
      // otherwise stretches this 16px box into a vertical pill. Tap-target size
      // must come from the surrounding label row, not the box itself.
      //
      // Unchecked is the system's form-control treatment — `border-input` on
      // the page, the same edge every input and outline button carries, and one
      // of the three borders the de-caging pass deliberately kept (WCAG
      // 1.4.11: a control with no fill has nothing else to bound it). It used
      // to be a solid PASTE-UP ink plate, which read as an already-ticked box.
      //
      // Checked prints in the pink track. `--spot` / `--ink-pink` were the
      // PASTE-UP alias names for that same colour and are gone; the token is
      // `--track-pink`, and type on any track fill is `--track-ring` (see
      // TRACK_TEXT in routeBulletMap) because a track fill is identity and does
      // not flip with the mode, so the mark on it must not either. The mark
      // reads 8.31:1 on pink. The two states differ by fill AND by the glyph,
      // so colour is never the only cue (WCAG 1.4.1).
      'peer h-4 w-4 min-h-0 shrink-0 rounded-badge border border-input bg-card disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-track-ring data-[state=checked]:bg-track-pink data-[state=checked]:text-track-ring',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
