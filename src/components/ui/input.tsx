import * as React from "react"
import TextField from "@mui/material/TextField"
import InputBase from "@mui/material/InputBase"

export interface InputProps extends React.ComponentProps<"input"> {
  // Keep the same interface as before
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <InputBase
        type={type}
        inputRef={ref}
        className={className}
        style={style}
        fullWidth
        size="small"
        sx={{
          height: 40,
          px: 1.5,
          py: 0.5,
          fontSize: { xs: '1rem', md: '0.875rem' },
          bgcolor: 'action.hover',
          borderRadius: 1.25,
          '&:focus-within': {
            bgcolor: 'action.selected',
          },
          '& input::placeholder': {
            color: 'text.secondary',
            opacity: 1,
          },
          '&.Mui-disabled': {
            cursor: 'not-allowed',
            opacity: 0.5,
          },
        }}
        {...(props as any)}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
