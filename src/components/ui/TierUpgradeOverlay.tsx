import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TierUpgradeOverlayProps {
  open: boolean;
  tierName: string;
  tagline?: string;
  icon?: React.ReactNode;
  onDismiss?: () => void;
  /** Auto-dismiss timeout in ms. Default 4200ms; pass 0 to disable. */
  autoDismissMs?: number;
}

const SPARKLE_COUNT = 8;

/**
 * Full-screen celebration moment when user advances a trust tier.
 * Spring-scales the tier badge, fans out sparkle particles, auto-dismisses.
 */
export function TierUpgradeOverlay({
  open,
  tierName,
  tagline,
  icon,
  onDismiss,
  autoDismissMs = 4200,
}: TierUpgradeOverlayProps) {
  React.useEffect(() => {
    if (!open || !autoDismissMs) return;
    const id = setTimeout(() => onDismiss?.(), autoDismissMs);
    return () => clearTimeout(id);
  }, [open, autoDismissMs, onDismiss]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-background/85"
          onClick={onDismiss}
          role="dialog"
          aria-label={`Tier upgrade: ${tierName}`}
        >
          {/* Sparkle particles */}
          {Array.from({ length: SPARKLE_COUNT }).map((_, i) => {
            const angle = (i / SPARKLE_COUNT) * Math.PI * 2;
            const distance = 180;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance;
            return (
              <motion.span
                key={i}
                className="absolute text-foreground"
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: dx,
                  y: dy,
                  scale: [0, 1, 0.6],
                  opacity: [0, 1, 0],
                  rotate: 360,
                }}
                transition={{
                  duration: 1.8,
                  delay: 0.3 + i * 0.04,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Sparkles size={14} />
              </motion.span>
            );
          })}

          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 220,
              damping: 18,
              delay: 0.15,
            }}
            className="relative flex flex-col items-center text-center max-w-sm px-8"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: [0, -8, 8, 0] }}
              transition={{
                type: 'spring',
                stiffness: 180,
                damping: 14,
                delay: 0.35,
              }}
              className={cn(
                'relative mb-6 flex h-24 w-24 items-center justify-center',
                'bg-foreground text-background rounded-full',
              )}
            >
              {icon ?? <Sparkles size={42} />}
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-foreground"
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 1.4, repeat: 2, ease: 'easeOut' }}
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2"
            >
              Tier unlocked
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-4xl font-bold tracking-tight mb-3"
            >
              {tierName}
            </motion.h2>
            {tagline && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="text-sm text-muted-foreground leading-relaxed mb-8"
              >
                {tagline}
              </motion.p>
            )}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
            >
              <Button onClick={onDismiss} variant="default">
                Continue
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
