import * as React from "react"
import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "rectangular" | "circular" | "rounded";
  width?: number | string;
  height?: number | string;
  animation?: "pulse" | "wave" | false;
}

function Skeleton({ className, variant = "rounded", width, height, animation = "pulse", style, ...props }: SkeletonProps) {
  const variantClass =
    variant === "circular" ? "rounded-full"
    : variant === "rectangular" ? "rounded-none"
    : variant === "text" ? "rounded-badge h-4"
    : "rounded-element"
  const animClass = animation === false ? "" : "animate-pulse"
  return (
    <div
      className={cn("bg-muted", variantClass, animClass, className)}
      style={{ width, height, ...style }}
      {...props}
    />
  )
}

export { Skeleton }
