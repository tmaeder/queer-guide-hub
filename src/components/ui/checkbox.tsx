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
      // Unchecked is an inverted plate (19.78:1 vs the page); checked prints in
      // the first drum. The two states differ by HUE and fill, never by an
      // outline. The mark reads 8.31:1 on pink.
      'peer h-4 w-4 min-h-0 shrink-0 rounded-badge bg-inverse-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spot disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-ink-pink data-[state=checked]:text-ink-pink-foreground',
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
