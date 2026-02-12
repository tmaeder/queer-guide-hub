import * as React from "react"
import MuiLinearProgress from "@mui/material/LinearProgress"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, ...props }, ref) => {
    const normalizedValue = max > 0 ? ((value || 0) / max) * 100 : 0;

    return (
      <MuiLinearProgress
        ref={ref as any}
        variant="determinate"
        value={normalizedValue}
        className={className}
        color="primary"
        {...(props as any)}
      />
    )
  }
)
Progress.displayName = "Progress"

export { Progress }
