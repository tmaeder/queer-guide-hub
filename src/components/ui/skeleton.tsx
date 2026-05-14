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
    : variant === "rectangular" ? "rounded-md"
    : variant === "text" ? "rounded-md h-4"
    : "rounded-xl"
  const animClass = animation === false ? "" : "animate-pulse"
  return (
    <div
      className={cn("bg-muted/80", variantClass, animClass, className)}
      style={{ width, height, ...style }}
      {...props}
    />
  )
}

export { Skeleton }
