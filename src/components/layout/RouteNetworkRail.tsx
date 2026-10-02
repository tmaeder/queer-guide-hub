import { routeJourneyTrack, type JourneyTrack } from './routeJourney';

const TRACK_Y: Record<JourneyTrack, number> = {
  pink: 18,
  blue: 38,
  green: 58,
  yellow: 78,
};

export function RouteNetworkRail({ pathname }: { pathname: string }) {
  const activeTrack = routeJourneyTrack(pathname);
  const stationY = TRACK_Y[activeTrack];

  return (
    <div className={`route-network-rail route-network-rail--${activeTrack}`} aria-hidden="true">
      <svg viewBox="0 0 1600 96" preserveAspectRatio="none" role="presentation">
        {(Object.keys(TRACK_Y) as JourneyTrack[]).map((track) => {
          const y = TRACK_Y[track];
          return (
            <path
              key={track}
              className={`route-network-rail__track route-network-rail__track--${track}`}
              d={`M -20 ${y} C 320 ${y - 18} 520 ${y + 18} 810 ${y} C 1090 ${y - 16} 1300 ${y + 12} 1620 ${y}`}
              pathLength="1"
            />
          );
        })}
        <circle className="route-network-rail__station" cx="310" cy={stationY - 9} r="10" />
        <circle className="route-network-rail__station" cx="1270" cy={stationY + 8} r="10" />
        <circle className="route-network-rail__interchange" cx="810" cy={stationY} r="16" />
      </svg>
    </div>
  );
}
