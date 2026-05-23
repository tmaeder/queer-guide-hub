import * as React from 'react';
import { cn } from '@/lib/utils';

type SurfaceTone = 'page' | 'sunken' | 'raised' | 'elevated' | 'dim';

const TONE_CLASSES: Record<SurfaceTone, string> = {
  page: 'bg-background',
  sunken: 'bg-surface-container-low',
  raised: 'bg-card',
  elevated: 'bg-surface-container-high',
  dim: 'bg-surface-dim',
};

interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
  /** Visual layer in the elevation ladder. */
  tone?: SurfaceTone;
  /** Render a hairline border-y around the surface (banded section). */
  banded?: boolean;
  as?: 'section' | 'div' | 'aside' | 'header' | 'footer';
}

export const Surface = React.forwardRef<HTMLElement, SurfaceProps>(
  (
    { tone = 'page', banded = false, as: Tag = 'section', className, children, ...rest },
    ref,
  ) => {
    return React.createElement(
      Tag,
      {
        ref,
        className: cn(
          TONE_CLASSES[tone],
          banded && 'border-y border-hairline',
          className,
        ),
        ...rest,
      },
      children,
    );
  },
);

Surface.displayName = 'Surface';
