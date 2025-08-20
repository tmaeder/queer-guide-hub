/* eslint-disable */

export interface ButtonVariantProps {
  variant?: 'solid' | 'outline' | 'ghost' | 'subtle'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

export const button = {
  className: 'btn',
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'md',
    fontWeight: 'medium',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  variants: {
    variant: {
      solid: { bg: 'amber.500', color: 'white' },
      outline: { border: '1px solid', borderColor: 'amber.500', color: 'amber.500' },
      ghost: { color: 'amber.500' },
      subtle: { bg: 'amber.100', color: 'amber.800' },
    },
    size: {
      xs: { px: 2, py: 1, fontSize: 'xs' },
      sm: { px: 3, py: 2, fontSize: 'sm' },
      md: { px: 4, py: 2, fontSize: 'md' },
      lg: { px: 6, py: 3, fontSize: 'lg' },
      xl: { px: 8, py: 4, fontSize: 'xl' },
    },
  },
  defaultVariants: {
    variant: 'solid',
    size: 'md',
  },
}