import * as React from 'react';
import { cn } from '@/lib/utils';

type EyebrowElement = 'span' | 'div' | 'p';

interface EyebrowProps extends React.HTMLAttributes<HTMLElement> {
  as?: EyebrowElement;
  /** `kicker` = masthead dateline treatment (wider 0.2em tracking). */
  variant?: 'label' | 'kicker';
}

export const Eyebrow = React.forwardRef<HTMLElement, EyebrowProps>(
  ({ as: Tag = 'span', variant = 'label', className, children, ...rest }, ref) => {
    return React.createElement(
      Tag,
      {
        ref,
        className: cn(
          'inline-block text-2xs font-semibold uppercase text-muted-foreground',
          variant === 'kicker' ? 'tracking-[0.2em]' : 'tracking-label',
          className,
        ),
        ...rest,
      },
      children,
    );
  },
);

Eyebrow.displayName = 'Eyebrow';
