import * as React from "react"
import MuiDivider from "@mui/material/Divider"

interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

const Separator = React.forwardRef<HTMLHRElement, SeparatorProps>(
  ({ className, orientation = "horizontal", _decorative = true, style, ...props }, ref) => (
    <MuiDivider
      ref={ref}
      orientation={orientation}
      className={className}
      style={style}
      sx={orientation === "vertical" ? { height: '100%' } : {}}
      {...(props as Record<string, unknown>)}
    />
  )
);
Separator.displayName = "Separator"

export { Separator }
