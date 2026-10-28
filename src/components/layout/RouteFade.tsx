import React, { useState } from 'react';
import { useLocation } from 'react-router';
import { stripLocale } from '@/lib/locale';
import { isRouteMotionAllowed } from './routeJourney';

/** Quiet content arrival only. Loading UI reflects actual pending work;
 * navigation never draws a timed, route-coloured full-screen overlay. */
export const RouteFade = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  // A cold document should paint its heading immediately. Arrival motion is
  // for in-app navigation; opacity: 0 on first load delays the LCP candidate.
  const [initialLocationKey] = useState(location.key);
  const shouldAnimate =
    location.key !== initialLocationKey && isRouteMotionAllowed(location.pathname);
  const segmentKey = stripLocale(location.pathname).split('/').slice(0, 3).join('/') || 'root';
  return (
    <div
      key={segmentKey}
      className={shouldAnimate ? 'station-arrive' : undefined}
      style={{ minHeight: '100%' }}
    >
      {children}
    </div>
  );
};
