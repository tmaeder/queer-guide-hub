import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'react-router';
import { pageVariants } from '@/lib/motion';

interface MotionPageProps {
  children: React.ReactNode;
}

/**
 * Wraps the Routes tree with an AnimatePresence page transition.
 * Keyed by the first pathname segment so admin sub-route changes don't
 * re-animate the shell.
 */
export const MotionPage: React.FC<MotionPageProps> = ({ children }) => {
  const location = useLocation();
  const segmentKey = location.pathname.split('/')[1] || 'root';

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={segmentKey}
        variants={pageVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        style={{ minHeight: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export default MotionPage;
