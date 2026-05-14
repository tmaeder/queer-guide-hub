import type { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface AnimatedEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}

export function AnimatedEmptyState({
  icon: Icon,
  title,
  description,
  className,
}: AnimatedEmptyStateProps) {
  return (
    <div className={className ?? 'py-16 text-center'}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <Icon
          style={{
            height: 48,
            width: 48,
            color: 'hsl(var(--muted-foreground))',
            margin: '0 auto 16px',
          }}
        />
      </motion.div>
      <motion.h3
        className="text-lg text-muted-foreground"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        {title}
      </motion.h3>
      {description && (
        <motion.p
          className="mt-2 text-sm text-muted-foreground"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          {description}
        </motion.p>
      )}
    </div>
  );
}
