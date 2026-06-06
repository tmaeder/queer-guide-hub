import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const SOFT = "border-transparent bg-muted text-foreground"

const badgeVariants = cva(
  "inline-flex items-center rounded-badge border px-2.5 py-0.5 text-xs2 font-medium tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-foreground text-background",
        outline: "border-foreground/20 bg-background/60 backdrop-blur-sm text-foreground hover:border-foreground/40",
        soft: SOFT,
        // `secondary` is a legacy alias of `soft` — same single source.
        secondary: SOFT,
        destructive: "border-transparent bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
