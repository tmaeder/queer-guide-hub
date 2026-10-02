import React from 'react';
import { useLocation } from 'react-router';
import { stripLocale } from '@/lib/locale';
import {
  isRouteMotionAllowed,
  routeJourneyTrack,
  routeStationName,
  ROUTE_JOURNEY_MS,
  type JourneyTrack,
} from './routeJourney';

interface RouteJourneyState {
  from: string;
  to: string;
  track: JourneyTrack;
  id: number;
}

function RouteJourney({ journey }: { journey: RouteJourneyState }) {
  return (
    <div
      key={journey.id}
      className={`route-journey route-journey--${journey.track}`}
      aria-hidden="true"
      data-testid="route-journey"
    >
      <div className="route-journey__stage">
        <span className="route-journey__label route-journey__label--from">{journey.from}</span>
        <svg viewBox="0 0 1000 300" preserveAspectRatio="none" role="presentation">
          <path
            className="route-journey__line"
            pathLength="1"
            d="M 100 210 C 280 35 680 285 900 90"
          />
          <circle
            className="route-journey__station route-journey__station--from"
            cx="100"
            cy="210"
            r="24"
          />
          <circle
            className="route-journey__station route-journey__station--to"
            cx="900"
            cy="90"
            r="24"
          />
        </svg>
        <span className="route-journey__rider" />
        <span className="route-journey__label route-journey__label--to">{journey.to}</span>
      </div>
    </div>
  );
}

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
  const previousPath = React.useRef(location.pathname);
  const journeyId = React.useRef(0);
  const [journey, setJourney] = React.useState<RouteJourneyState | null>(null);

  React.useLayoutEffect(() => {
    const fromPath = previousPath.current;
    const toPath = location.pathname;
    previousPath.current = toPath;
    if (fromPath === toPath) return;

    if (!isRouteMotionAllowed(fromPath) || !isRouteMotionAllowed(toPath)) {
      setJourney(null);
      return;
    }

    journeyId.current += 1;
    setJourney({
      from: routeStationName(fromPath),
      to: routeStationName(toPath),
      track: routeJourneyTrack(toPath),
      id: journeyId.current,
    });
    const timer = window.setTimeout(() => setJourney(null), ROUTE_JOURNEY_MS);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  // Three path segments (matching the former LayoutShell transition key) so
  // detail→detail navigation within a section still gets the fade.
  const segmentKey = stripLocale(location.pathname).split('/').slice(0, 3).join('/') || 'root';
  const motionAllowed = isRouteMotionAllowed(location.pathname);
  return (
    <>
      {journey && <RouteJourney journey={journey} />}
      <div
        key={segmentKey}
        className={
          motionAllowed
            ? journey
              ? 'station-arrive station-arrive--journey'
              : 'station-arrive'
            : undefined
        }
        style={{ minHeight: '100%' }}
      >
        {children}
      </div>
    </>
  );
};
