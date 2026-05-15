import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface BackgroundGradientProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  animate?: boolean;
}

/**
 * Aceternity-style BackgroundGradient — animated monochrome ring of moving
 * radial gradients behind a card. Strictly monochrome (foreground at low
 * opacity).
 */
export function BackgroundGradient({
  children,
  className,
  containerClassName,
  animate = true,
}: BackgroundGradientProps) {
  const variants = {
    initial: { backgroundPosition: '0 50%' },
    animate: { backgroundPosition: ['0 50%', '100% 50%', '0 50%'] },
  };

  return (
    <div className={cn('relative p-[3px] group', containerClassName)}>
      <motion.div
        variants={animate ? variants : undefined}
        initial={animate ? 'initial' : undefined}
        animate={animate ? 'animate' : undefined}
        transition={animate ? { duration: 6, ease: 'linear', repeat: Infinity } : undefined}
        style={{ backgroundSize: animate ? '400% 400%' : undefined }}
        className={cn(
          'absolute inset-0 rounded-3xl opacity-60 group-hover:opacity-100 blur-xl transition duration-500 will-change-transform',
          'bg-[radial-gradient(circle_farthest-side_at_0_100%,hsl(var(--foreground)/0.4),transparent),radial-gradient(circle_farthest-side_at_100%_0,hsl(var(--foreground)/0.3),transparent),radial-gradient(circle_farthest-side_at_100%_100%,hsl(var(--foreground)/0.35),transparent),radial-gradient(circle_farthest-side_at_0_0,hsl(var(--foreground)/0.25),hsl(var(--background)))]',
        )}
      />
      <motion.div
        variants={animate ? variants : undefined}
        initial={animate ? 'initial' : undefined}
        animate={animate ? 'animate' : undefined}
        transition={animate ? { duration: 6, ease: 'linear', repeat: Infinity } : undefined}
        style={{ backgroundSize: animate ? '400% 400%' : undefined }}
        className={cn(
          'absolute inset-0 rounded-3xl will-change-transform',
          'bg-[radial-gradient(circle_farthest-side_at_0_100%,hsl(var(--foreground)/0.4),transparent),radial-gradient(circle_farthest-side_at_100%_0,hsl(var(--foreground)/0.3),transparent),radial-gradient(circle_farthest-side_at_100%_100%,hsl(var(--foreground)/0.35),transparent),radial-gradient(circle_farthest-side_at_0_0,hsl(var(--foreground)/0.25),hsl(var(--background)))]',
        )}
      />
      <div className={cn('relative z-10 rounded-3xl bg-card', className)}>{children}</div>
    </div>
  );
}
