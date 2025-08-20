import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

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
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export const IconButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = 'md', ...props }, ref) => {
    const sizeMap = { xs: 'h-7 w-7', sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-10 w-10', xl: 'h-11 w-11' }
    return (
      <Button
        className={cn(sizeMap[size], 'p-0', className)}
        size={size}
        ref={ref}
        {...props}
      />
    )
  }
)
IconButton.displayName = 'IconButton'