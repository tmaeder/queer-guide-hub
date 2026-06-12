import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"
import { hapticTrigger } from "@/hooks/useHaptics"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, onCheckedChange, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // min-h-0 beats the global 44px tap-target min-height (index.css), which
      // otherwise stretches the 20px track into a tall oval. Tap-target size
      // must come from the surrounding label row, not the track itself.
      "peer inline-flex h-5 w-9 min-h-0 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    )}
    onCheckedChange={(c) => { hapticTrigger('nudge'); onCheckedChange?.(c); }}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-background ring-1 ring-border/40 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
