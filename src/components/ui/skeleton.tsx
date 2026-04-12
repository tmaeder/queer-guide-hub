import * as React from "react"
import MuiSkeleton from "@mui/material/Skeleton"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "rectangular" | "circular" | "rounded";
  width?: number | string;
  height?: number | string;
  animation?: "pulse" | "wave" | false;
}

function Skeleton({ className, variant = "rounded", width, height, animation = "pulse", style, ...props }: SkeletonProps) {
  return (
    <MuiSkeleton
      variant={variant}
      width={width}
      height={height}
      animation={animation}
      className={className}
      style={style}
      sx={{ bgcolor: 'action.hover' }}
      {...(props as Record<string, unknown>)}
    />
  );
}

export { Skeleton }
