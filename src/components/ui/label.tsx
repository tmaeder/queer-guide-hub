import * as React from "react"
import FormLabel from "@mui/material/FormLabel"

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, style, ...props }, ref) => (
  <FormLabel
    ref={ref}
    className={className}
    style={style}
    sx={{
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1,
      '&.Mui-disabled': {
        cursor: 'not-allowed',
        opacity: 0.7,
      },
    }}
    {...(props as any)}
  />
))
Label.displayName = "Label"

export { Label }
