import { AnimatePresence, motion } from 'motion/react';
import { useMotionTokens } from '@/lib/motion';

interface SkeletonCrossfadeProps {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}

export function SkeletonCrossfade({
  loading,
  skeleton,
  children,
}: SkeletonCrossfadeProps) {
  // These are JS-driven opacity tweens, so `prefers-reduced-motion` does not
  // reach them the way a CSS transition would — it has to be consulted
  // explicitly. Without this a reduced-motion user still gets the 300ms
  // blur-and-fade they asked not to have, and the axe sweep (which runs with
  // reducedMotion: 'reduce') can sample the content mid-fade: partially
  // transparent card-foreground over the dark background reads as #5f5f5f on
  // #0a0a0a, a spurious 3.1:1 color-contrast failure on whichever rail happened
  // to resolve its data late.
  const { reduced } = useMotionTokens();

  if (reduced) {
    return <>{loading ? skeleton : children}</>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading ? (
        <motion.div
          key="skeleton"
          exit={{ opacity: 0, filter: 'blur(4px)' }}
          transition={{ duration: 0.2 }}
        >
          {skeleton}
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0, filter: 'blur(4px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
