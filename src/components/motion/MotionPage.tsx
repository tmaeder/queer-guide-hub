import React, { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation, useNavigationType } from 'react-router';
import { easing } from '@/lib/motion';
import { duration } from '@/lib/animation';

interface MotionPageProps {
  children: React.ReactNode;
}

/**
 * Wraps the Routes tree with direction-aware page transitions.
 * PUSH/REPLACE → slide in from right; POP (back) → slide in from left.
 */
export const MotionPage = ({ children }: MotionPageProps) => {
  const location = useLocation();
  const navType = useNavigationType();
  const segmentKey = location.pathname.split('/')[1] || 'root';
  const dirRef = useRef(1);
  dirRef.current = navType === 'POP' ? -1 : 1;
  const xOffset = 40 * dirRef.current;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={segmentKey}
        initial={{ opacity: 0, x: xOffset }}
        animate={{
          opacity: 1,
          x: 0,
          transition: { duration: duration.normal, ease: easing.smooth },
        }}
        exit={{
          opacity: 0,
          x: -xOffset * 0.5,
          transition: { duration: 0.15, ease: easing.accel },
        }}
        style={{ minHeight: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export default MotionPage;
