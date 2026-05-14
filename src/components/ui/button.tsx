import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-semibold uppercase tracking-wide ring-offset-background transition-[background,color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Solid black / white-on-dark — the default editorial CTA.
        default: "bg-foreground text-background hover:opacity-85 active:opacity-70",
        // 1px hairline, transparent fill.
        outline: "border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
        // No chrome until hover.
        ghost: "bg-transparent text-foreground hover:bg-muted",
        // Inline link styling — underline always for anchor affordance.
        link: "bg-transparent text-foreground underline underline-offset-4 hover:opacity-70",
        // Single chromatic exception: irreversible / destructive actions.
        destructive: "bg-destructive text-destructive-foreground hover:opacity-85 active:opacity-70",
        // Legacy aliases — both collapse to default. Retained for compat
        // while callsites are migrated.
        secondary: "bg-foreground text-background hover:opacity-85",
        brand: "bg-foreground text-background hover:opacity-85",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-7 text-sm",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const isInert = disabled || loading
    const content = loading ? (
      <span className="relative inline-flex items-center">
        <span className="invisible inline-flex items-center">{children}</span>
        <Loader2 className="absolute left-1/2 top-1/2 -ml-2 -mt-2 h-4 w-4 animate-spin" />
      </span>
    ) : (
      children
    )
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isInert}
        aria-busy={loading || undefined}
        {...props}
      >
        {content}
      </Comp>
    )
  }
)
Button.displayName = "Button"

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
