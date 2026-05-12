import { AnimatePresence, motion } from 'motion/react';

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
