import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnimatedModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  hideCloseButton?: boolean;
}

/**
 * Aceternity-style AnimatedModal — backdrop blurs in, modal content does a
 * door-opening 3D rotateX + scale entrance. Monochrome chrome.
 */
export function AnimatedModal({ open, onClose, children, className, hideCloseButton }: AnimatedModalProps) {
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60"
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotateX: 40, y: 40 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, rotateX: 0, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, rotateX: -10 }}
            transition={{ type: 'spring', stiffness: 240, damping: 26, mass: 0.7 }}
            style={{ perspective: 1000 }}
            className={cn(
              'relative z-10 max-w-lg w-full bg-card border border-border/60 rounded-container shadow-[var(--shadow-aceternity-lg)] p-6',
              className,
            )}
          >
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X size={16} />
              </button>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
