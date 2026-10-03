import { PAGE_GUTTER } from './PageContainer';
import { routeJourneyTrack, routeStationName } from './routeJourney';
import { cn } from '@/lib/utils';

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
          <circle className="route-network-rail__station" cx="178" cy="20" r="7" />
          <circle className="route-network-rail__interchange" cx="470" cy="27" r="11" />
          <circle className="route-network-rail__station" cx="744" cy="31" r="7" />
        </svg>
      </div>
    </div>
  );
}
