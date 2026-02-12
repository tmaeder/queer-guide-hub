import * as React from 'react'
import Box from '@mui/material/Box'

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  sx?: any;
}
export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  sx?: any;
}
export interface CardContentProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  sx?: any;
}
export interface CardFooterProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  sx?: any;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ sx, ...props }, ref) => (
    <Box
      ref={ref}
      sx={{
        borderRadius: 2,
        bgcolor: 'background.paper',
        boxShadow: 1,
        overflow: 'hidden',
        transition: 'all 0.2s',
        '&:hover': {
          boxShadow: 3
        },
        ...sx
      }}
      {...props}
    />
  )
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ sx, ...props }, ref) => (
    <Box
      ref={ref}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        p: 3,
        borderBottom: '1px solid #e5e5e5',
        ...sx
      }}
      {...props}
    />
  )
)
CardHeader.displayName = 'CardHeader'

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ sx, ...props }, ref) => (
    <Box ref={ref} sx={{ p: 3, ...sx }} {...props} />
  )
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ sx, ...props }, ref) => (
    <Box
      ref={ref}
      sx={{
        display: 'flex',
        alignItems: 'center',
        p: 3,
        borderTop: '1px solid #e5e5e5',
        ...sx
      }}
      {...props}
    />
  )
)
CardFooter.displayName = 'CardFooter'