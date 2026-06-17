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

/* ── Composed templates ────────────────────────────────────────────────
   Reusable placeholder shapes so lists stop hand-rolling skeleton stacks.
   Shapes mirror EntityCard / list-row layouts. */

/** Image-over-text card placeholder matching EntityCard's proportions. */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-container border border-border", className)}>
      <Skeleton variant="rectangular" className="aspect-[4/5] w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton variant="text" className="h-3 w-1/3" />
        <Skeleton variant="text" className="h-5 w-3/4" />
        <Skeleton variant="text" className="h-3 w-1/2" />
      </div>
    </div>
  )
}

/** Responsive grid of SkeletonCards mirroring the canonical browse grid. */
function SkeletonGrid({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn(
        "grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

/** Horizontal list-row placeholder (avatar + two text lines). */
function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 p-4", className)}>
      <Skeleton variant="circular" className="h-10 w-10 shrink-0" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton variant="text" className="h-4 w-1/2" />
        <Skeleton variant="text" className="h-3 w-1/3" />
      </div>
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonGrid, SkeletonRow }
