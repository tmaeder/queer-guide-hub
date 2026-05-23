import * as React from 'react';
import { cn } from '@/lib/utils';

type EyebrowElement = 'span' | 'div' | 'p';

interface EyebrowProps extends React.HTMLAttributes<HTMLElement> {
  as?: EyebrowElement;
}

export const Eyebrow = React.forwardRef<HTMLElement, EyebrowProps>(
  ({ as: Tag = 'span', className, children, ...rest }, ref) => {
    return React.createElement(
      Tag,
      {
        ref,
        className: cn(
          'inline-block text-2xs font-semibold uppercase tracking-label text-muted-foreground',
          className,
        ),
        ...rest,
      },
      children,
    );
  },
);

Eyebrow.displayName = 'Eyebrow';
