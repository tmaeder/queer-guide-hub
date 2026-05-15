import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface AnimatedBeamConnectorProps {
  /** When true the beam fills with the foreground color and animates. */
  active?: boolean;
  /** Orientation. Defaults to vertical (1px wide column). */
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

/**
 * Thin animated connector for step indicators. Inactive: muted hairline.
 * Active: foreground fill that draws in over 600ms with a faint shimmer.
 */
export function AnimatedBeamConnector({
  active = false,
  orientation = 'vertical',
  className,
}: AnimatedBeamConnectorProps) {
  const isV = orientation === 'vertical';
  return (
    <span
      aria-hidden
      className={cn(
        'overflow-hidden bg-border',
        isV ? 'w-px' : 'h-px',
        className,
      )}
    >
      <motion.span
        className="block bg-foreground"
        initial={false}
        animate={
          isV
            ? { height: active ? '100%' : '0%' }
            : { width: active ? '100%' : '0%' }
        }
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={isV ? { width: '1px' } : { height: '1px' }}
      />
      {active && (
        <motion.span
          className="block bg-foreground/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={
            isV
              ? { width: '1px', height: '20%', marginTop: '-100%' }
              : { height: '1px', width: '20%', marginLeft: '-100%' }
          }
        />
      )}
    </span>
  );
}
