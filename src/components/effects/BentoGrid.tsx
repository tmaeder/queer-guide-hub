import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/motion';
import { stagger } from '@/lib/animation';

interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export function BentoGrid({ children, className }: BentoGridProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5',
        className,
      )}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      variants={
        reduced
          ? undefined
          : {
              hidden: {},
              visible: { transition: { staggerChildren: stagger.normal } },
            }
      }
    >
      {children}
    </motion.div>
  );
}

interface BentoGridItemProps {
  children: React.ReactNode;
  className?: string;
  colSpan?: 1 | 2;
  rowSpan?: 1 | 2;
}

export function BentoGridItem({
  children,
  className,
  colSpan = 1,
  rowSpan = 1,
}: BentoGridItemProps) {
  const reduced = useReducedMotion();

  const spanClasses = cn(
    colSpan === 2 && 'sm:col-span-2',
    rowSpan === 2 && 'row-span-2',
  );

  return (
    <motion.div
      className={cn(
        'border border-border bg-card p-5 md:p-7 transition-colors hover:bg-accent/50',
        spanClasses,
        className,
      )}
      variants={
        reduced
          ? undefined
          : {
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0, transition: springs.snappy },
            }
      }
    >
      {children}
    </motion.div>
  );
}
