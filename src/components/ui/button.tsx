import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold uppercase tracking-wide ring-offset-background transition-[transform,background,color,box-shadow,opacity] duration-200 ease-out will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 hover:-translate-y-px active:translate-y-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Solid editorial CTA — subtle inset gradient on the foreground.
        default: "bg-foreground text-background bg-[linear-gradient(180deg,hsl(var(--foreground))_0%,hsl(var(--foreground)/0.92)_100%)] shadow-sm hover:shadow-md",
        // 1px hairline, transparent fill, fills on hover.
        outline: "border border-foreground/80 bg-transparent text-foreground hover:bg-foreground hover:text-background",
        // No chrome until hover.
        ghost: "bg-transparent text-foreground hover:bg-muted",
        // Inline link styling — underline always for anchor affordance.
        link: "bg-transparent text-foreground underline underline-offset-4 hover:opacity-70 hover:translate-y-0",
        // Single chromatic exception: irreversible / destructive actions.
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:shadow-md hover:opacity-90 active:opacity-80",
        // Soft surface variant — for secondary CTAs.
        soft: "bg-muted text-foreground border border-border hover:bg-accent",
        // Legacy aliases — collapse to default. Retained for compat.
        secondary: "bg-foreground text-background shadow-sm hover:shadow-md",
        brand: "bg-foreground text-background shadow-sm hover:shadow-md",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-9 px-4 text-xs rounded-md",
        lg: "h-12 px-7 text-sm rounded-lg",
        xl: "h-14 px-8 text-sm rounded-lg",
        icon: "h-10 w-10 rounded-md",
        pill: "h-10 px-5 rounded-full",
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
