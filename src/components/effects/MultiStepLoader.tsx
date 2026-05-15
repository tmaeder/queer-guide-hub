import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LoadingState {
  text: string;
}

interface MultiStepLoaderProps {
  loadingStates: LoadingState[];
  loading: boolean;
  duration?: number;
  loop?: boolean;
  onFinish?: () => void;
  className?: string;
}

/**
 * Aceternity-style MultiStepLoader — vertical list of steps that progress
 * automatically through a `duration` cycle per step. Useful for animated
 * "processing" overlays during submission flows.
 */
export function MultiStepLoader({
  loadingStates,
  loading,
  duration = 1800,
  loop = false,
  onFinish,
  className,
}: MultiStepLoaderProps) {
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    if (!loading) {
      setCurrent(0);
      return;
    }
    const id = setInterval(() => {
      setCurrent((prev) => {
        const next = prev + 1;
        if (next >= loadingStates.length) {
          if (loop) return 0;
          clearInterval(id);
          onFinish?.();
          return prev;
        }
        return next;
      });
    }, duration);
    return () => clearInterval(id);
  }, [loading, duration, loadingStates.length, loop, onFinish]);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          className={cn('fixed inset-0 z-[1200] flex items-center justify-center bg-black/60', className)}
        >
          <div className="bg-card border border-border/60 rounded-container p-8 shadow-[var(--shadow-aceternity-lg)] min-w-[20rem] max-w-md">
            <ul className="space-y-3">
              {loadingStates.map((state, i) => {
                const status = i < current ? 'done' : i === current ? 'active' : 'pending';
                return (
                  <li key={i} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                        status === 'done' && 'bg-foreground border-foreground text-background',
                        status === 'active' && 'border-foreground text-foreground',
                        status === 'pending' && 'border-border text-muted-foreground',
                      )}
                    >
                      {status === 'done' ? (
                        <Check size={14} />
                      ) : status === 'active' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                      )}
                    </span>
                    <span
                      className={cn(
                        'text-sm transition-colors',
                        status === 'done' && 'text-muted-foreground line-through',
                        status === 'active' && 'text-foreground font-medium',
                        status === 'pending' && 'text-muted-foreground',
                      )}
                    >
                      {state.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
