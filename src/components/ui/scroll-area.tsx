import * as React from "react"
import Box from "@mui/material/Box"

const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { type?: string }>(
  ({ className, children, style, ...props }, ref) => (
    <Box
      ref={ref}
      className={className}
      style={style}
      sx={{ position: 'relative', overflow: 'auto', height: '100%', width: '100%' }}
      {...(props as any)}
    >
      {children}
    </Box>
  )
);
ScrollArea.displayName = "ScrollArea"

const ScrollBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { orientation?: "vertical" | "horizontal" }>(
  (props, ref) => null
);
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
