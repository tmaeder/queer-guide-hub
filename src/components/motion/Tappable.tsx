import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { springs } from '@/lib/motion';

type TappableElement = 'button' | 'div' | 'a';

interface TappableProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  as?: TappableElement;
  hoverScale?: number;
  tapScale?: number;
  disabled?: boolean;
  href?: string;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Drop-in motion element with tactile hover + press feedback.
 */
export const Tappable = React.forwardRef<HTMLElement, TappableProps>(
  (
    { children, as = 'button', hoverScale = 1.02, tapScale = 0.97, disabled, ...rest },
    ref,
  ) => {
    const reduced = useReducedMotion();
    const MotionTag = motion[as] as typeof motion.button;

    const interactionProps = reduced || disabled
      ? {}
      : {
          whileHover: { scale: hoverScale },
          whileTap: { scale: tapScale },
          transition: springs.snappy,
        };

    return (
      <MotionTag
        ref={ref as React.Ref<HTMLButtonElement>}
        disabled={disabled as boolean | undefined}
        {...interactionProps}
        {...(rest as object)}
      >
        {children}
      </MotionTag>
    );
  },
);

Tappable.displayName = 'Tappable';

export default Tappable;
