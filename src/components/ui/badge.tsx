import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded px-2.5 py-0.5 text-xs font-semibold transition-opacity focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:opacity-80",
        secondary:
          "bg-secondary text-secondary-foreground hover:opacity-80",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-80",
        outline: "bg-muted text-foreground hover:opacity-80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
