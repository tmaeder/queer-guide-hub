import * as React from 'react';
import { cn } from '@/lib/utils';

type EyebrowElement = 'span' | 'div' | 'p';

interface EyebrowProps extends React.HTMLAttributes<HTMLElement> {
  as?: EyebrowElement;
  /** `kicker` = subway-map masthead chip: paper type on an ink block. */
  variant?: 'label' | 'kicker';
}

export const Eyebrow = React.forwardRef<HTMLElement, EyebrowProps>(
  ({ as: Tag = 'span', variant = 'label', className, children, ...rest }, ref) => {
    return React.createElement(
      Tag,
      {
        ref,
        className: cn(
          'inline-block uppercase',
          variant === 'kicker'
            ? 'bg-foreground px-2 py-1 font-display text-13 normal-case text-background'
            : 'text-2xs font-semibold tracking-label text-muted-foreground',
          className,
        ),
        ...rest,
      },
      children,
    );
  },
);

Eyebrow.displayName = 'Eyebrow';
