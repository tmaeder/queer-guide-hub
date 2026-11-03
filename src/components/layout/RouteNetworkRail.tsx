import { PAGE_GUTTER } from './PageContainer';
import { routeJourneyTrack, routeStationName } from './routeJourney';
import { cn } from '@/lib/utils';

/**
 * The ambient family line for pages with no breadcrumb trail: the section's
 * name at the start, then that section's line.
 *
 * It used to carry three stations inside the stretched SVG. They named
 * nothing (a station is a stop you can read), and a circle in a
 * `preserveAspectRatio="none"` viewBox renders as an oval. The line also ran a
 * normalized dash draw-in, which finishes short once the SVG is stretched
 * non-uniformly, so the track stopped early and left the last station
 * floating. The line now runs the full width, with no fake stops on it.
 */
export function RouteNetworkRail({ pathname }: { pathname: string }) {
  const activeTrack = routeJourneyTrack(pathname);
  const stationName = routeStationName(pathname);

  return (
    <div className={`route-network-rail route-network-rail--${activeTrack}`} aria-hidden="true">
      <div className={cn('route-network-rail__inner', PAGE_GUTTER)}>
        <span className="route-network-rail__identity">
          <span className="route-network-rail__identity-station" />
          <span className="route-network-rail__identity-label">{stationName}</span>
        </span>
        <svg viewBox="0 0 900 52" preserveAspectRatio="none" role="presentation">
          <path
            className={`route-network-rail__track route-network-rail__track--${activeTrack}`}
            d="M -20 28 C 170 10 320 42 470 27 C 620 12 740 40 920 22"
            pathLength="1"
          />
        </svg>
      </div>
    </div>
  );
}
