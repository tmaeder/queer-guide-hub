import { useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface MovingBorderProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  borderWidth?: number;
  duration?: number;
  as?: 'button' | 'div' | 'a';
  onClick?: () => void;
}

export function MovingBorder({
  children,
  className,
  containerClassName,
  borderWidth = 1.5,
  duration = 3,
  as: Tag = 'button',
  onClick,
}: MovingBorderProps) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  if (reduced) {
    return (
      <Tag
        className={cn('border border-border px-5 py-2.5 font-medium', className)}
        onClick={onClick}
      >
        {children}
      </Tag>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative inline-block p-[2px] overflow-hidden group', containerClassName)}
      style={{ padding: borderWidth }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          background: `conic-gradient(from 0deg, transparent 0%, transparent 60%, hsl(var(--foreground) / 0.5) 80%, transparent 100%)`,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
      <Tag
        className={cn(
          'relative bg-background px-5 py-2.5 font-medium flex items-center gap-2',
          className,
        )}
        onClick={onClick}
      >
        {children}
      </Tag>
    </div>
  );
}
