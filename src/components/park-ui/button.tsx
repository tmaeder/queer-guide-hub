import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import Box from '@mui/material/Box'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        solid: 'bg-amber-500 text-white shadow hover:bg-amber-600',
        outline: 'border border-amber-500 bg-transparent text-amber-500 hover:bg-amber-50',
        ghost: 'text-amber-500 hover:bg-amber-50',
        subtle: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
      },
      size: {
        xs: 'h-7 px-2 text-xs',
        sm: 'h-8 px-3 text-sm',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
        xl: 'h-11 px-8 text-base',
      },
    },
    defaultVariants: {
      variant: 'solid',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>,
    VariantProps<typeof buttonVariants> {
  sx?: any;
}

const getVariantStyles = (variant: ButtonProps['variant']) => {
  switch (variant) {
    case 'outline':
      return {
        border: '1px solid #f59e0b',
        bgcolor: 'transparent',
        color: '#f59e0b',
        '&:hover': { bgcolor: '#fef3c7' }
      };
    case 'ghost':
      return {
        color: '#f59e0b',
        '&:hover': { bgcolor: '#fef3c7' }
      };
    case 'subtle':
      return {
        bgcolor: '#fef3c7',
        color: '#92400e',
        '&:hover': { bgcolor: '#fde68a' }
      };
    default: // solid
      return {
        bgcolor: '#f59e0b',
        color: 'white',
        boxShadow: 1,
        '&:hover': { bgcolor: '#d97706' }
      };
  }
};

const getSizeStyles = (size: ButtonProps['size']) => {
  switch (size) {
    case 'xs':
      return { height: 28, px: 1, fontSize: '0.75rem' };
    case 'sm':
      return { height: 32, px: 1.5, fontSize: '0.875rem' };
    case 'lg':
      return { height: 40, px: 3 };
    case 'xl':
      return { height: 44, px: 4, fontSize: '1rem' };
    default: // md
      return { height: 36, px: 2 };
  }
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ sx, variant = 'solid', size = 'md', ...props }, ref) => {
    return (
      <Box
        component="button"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 1,
          fontSize: '0.875rem',
          fontWeight: 500,
          transition: 'colors 0.2s',
          '&:focus-visible': {
            outline: 'none',
            boxShadow: '0 0 0 1px var(--ring)'
          },
          '&:disabled': {
            pointerEvents: 'none',
            opacity: 0.5
          },
          ...getVariantStyles(variant),
          ...getSizeStyles(size),
          ...sx
        }}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export const IconButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ sx, size = 'md', ...props }, ref) => {
    const sizeMap = { xs: 28, sm: 32, md: 36, lg: 40, xl: 44 };
    return (
      <Button
        sx={{
          height: sizeMap[size || 'md'],
          width: sizeMap[size || 'md'],
          p: 0,
          ...sx
        }}
        size={size}
        ref={ref}
        {...props}
      />
    )
  }
)
IconButton.displayName = 'IconButton'