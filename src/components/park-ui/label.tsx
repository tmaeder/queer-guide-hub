import * as React from 'react'
import Box from '@mui/material/Box'

export interface LabelProps extends Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'className'> {
  sx?: any;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ sx, ...props }, ref) => (
    <Box
      component="label"
      ref={ref}
      sx={{
        fontSize: '0.875rem',
        fontWeight: 500,
        lineHeight: 1,
        color: '#404040',
        '&:has(~ :disabled)': {
          cursor: 'not-allowed',
          opacity: 0.7
        },
        ...sx
      }}
      {...props}
    />
  )
)
Label.displayName = 'Label'