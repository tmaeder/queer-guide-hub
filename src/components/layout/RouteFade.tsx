import React, { useState } from 'react';
import { useLocation } from 'react-router';
import { stripLocale } from '@/lib/locale';
import { isRouteMotionAllowed } from './routeJourney';

/** Quiet content arrival only. Loading UI reflects actual pending work;
 * navigation never draws a timed, route-coloured full-screen overlay. */
export const RouteFade = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const segmentKey = stripLocale(pathname).split('/').slice(0, 3).join('/') || 'root';
  // Track the previous destination so Back to the initial page can animate
  // while a cold load, a filter change, or a detail tab switch stays still.
  const [arrival, setArrival] = useState({ pathname, segmentKey, animate: false });
  if (pathname !== arrival.pathname) {
    setArrival({
      pathname,
      segmentKey,
      animate: segmentKey !== arrival.segmentKey && isRouteMotionAllowed(pathname),
    });
  }
  return (
    <div
      key={segmentKey}
      className={arrival.animate ? 'route-fade' : undefined}
      style={{ minHeight: '100%' }}
    >
      {children}
    </div>
  );
};
