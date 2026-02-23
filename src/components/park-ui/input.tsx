import * as React from 'react'
import Box from '@mui/material/Box'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> {
  sx?: any;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ sx, type, ...props }, ref) => {
    return (
      <Box
        component="input"
        type={type}
        sx={{
          display: 'flex',
          height: 40,
          width: '100%',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'white',
          px: 1.5,
          py: 1,
          fontSize: '0.875rem',
          color: '#171717',
          '&::placeholder': {
            color: '#a3a3a3'
          },
          '&:focus': {
            borderColor: '#f59e0b',
            outline: 'none',
            boxShadow: '0 0 0 1px #f59e0b'
          },
          '&:disabled': {
            cursor: 'not-allowed',
            bgcolor: 'action.disabledBackground',
            color: '#a3a3a3'
          },
          ...sx
        }}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'