import React from 'react';
import { useLocation } from 'react-router';

/**
 * CSS-only route transition. Replaces the framer-motion MotionPage wrapper:
 * AnimatePresence mode="wait" held the incoming route's paint hostage to the
 * outgoing exit animation, and the motion/react import chained ~97 KB of
 * framer-motion onto the entry chunk's critical path.
 *
 * Remounts on top-level path segment change (same key rule as MotionPage), so
 * the `route-fade` keyframe replays. The keyframe only animates FROM opacity 0
 * — if animations never run (reduced motion, headless), content renders at
 * its natural, fully-visible state.
 */
export const RouteFade = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const segmentKey = location.pathname.split('/')[1] || 'root';
  return (
    <div key={segmentKey} className="route-fade" style={{ minHeight: '100%' }}>
      {children}
    </div>
  );
};
