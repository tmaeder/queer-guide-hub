import React from 'react';
import { useLocation } from 'react-router';
import { stripLocale } from '@/lib/locale';

/**
 * CSS-only route transition. Replaces the framer-motion MotionPage wrapper:
 * AnimatePresence mode="wait" held the incoming route's paint hostage to the
 * outgoing exit animation, and the motion/react import chained ~97 KB of
 * framer-motion onto the entry chunk's critical path.
 *
 * Remounts on top-level path segment change (same key rule as MotionPage), so
 * the `paper-feed` keyframe replays. The keyframe only animates FROM opacity 0
 * — if animations never run (reduced motion, headless), content renders at
 * its natural, fully-visible state.
 *
 * The keyframe is `station-arrive`: content decelerates the last few pixels
 * and comes to rest, the way a train settles at a platform. It replaced
 * `paper-feed`, a printing metaphor inherited from the retired PASTE-UP
 * identity — mechanically similar, but naming a press rather than a network.
 */
export const RouteFade = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  // Three path segments (matching the former LayoutShell transition key) so
  // detail→detail navigation within a section still gets the fade.
  const segmentKey = stripLocale(location.pathname).split('/').slice(0, 3).join('/') || 'root';
  return (
    <div key={segmentKey} className="station-arrive" style={{ minHeight: '100%' }}>
      {children}
    </div>
  );
};
