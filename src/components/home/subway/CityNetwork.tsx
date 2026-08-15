import type { Track } from '@/components/transit/routeBulletMap';
import { CITY_NETWORKS, NETWORK_VIEWBOX } from './cityNetworkGeometry';

/** Track color as an SVG stroke. Written out in full so Tailwind's scanner
 *  sees each class — a template literal here would generate nothing. */
const TRACK_STROKE: Record<Track, string> = {
  pink: 'stroke-track-pink',
  blue: 'stroke-track-blue',
  green: 'stroke-track-green',
  yellow: 'stroke-track-yellow',
};

/** Bare colored strokes, no ink casing — the lines on a printed network map
 *  are the map's own legend and a black outline reads as a border around a
 *  shape rather than as a route. Design decision, 2026-08-14. */
const LINE_WIDTH = 5;

/** Template lines for cities with no rail network of their own — the geometry
 *  this component replaced. Four shapes cycled by card index so neighbouring
 *  fallbacks never bend the same way; they converge on 100,17 where the
 *  station ring sits. Drawn in the original 200x34 band and centered
 *  vertically in the taller network box. */
const TEMPLATE_LINES = [
  'M 6 20 C 40 12 70 24 100 17 C 130 10 165 22 194 15',
  'M 6 18 C 38 24 72 12 100 17 C 135 22 160 10 194 16',
  'M 6 14 C 45 22 80 10 100 17 C 125 24 170 12 194 18',
  'M 6 16 C 42 10 76 24 100 17 C 128 12 166 22 194 14',
];
const TEMPLATE_TRACKS: Track[] = ['pink', 'green', 'blue', 'yellow'];
const TEMPLATE_BAND_H = 34;
const TEMPLATE_SHIFT = (NETWORK_VIEWBOX.h - TEMPLATE_BAND_H) / 2;

interface Props {
  /** `cities.slug` — the key into the generated geometry. */
  slug: string | null;
  /** Card position, used to pick a template line when there is no network. */
  index: number;
}

function TrackLine({ d, track }: { d: string; track: Track }) {
  return (
    <path
      d={d}
      fill="none"
      className={TRACK_STROKE[track]}
      strokeWidth={LINE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** The station ring — paper disc, ink rim, the same mark the rest of the
 *  system uses for a stop. */
function Station({ x, y }: { x: number; y: number }) {
  return (
    <circle cx={x} cy={y} r={6} className="fill-background stroke-foreground" strokeWidth={3} />
  );
}

/**
 * A city's rapid-transit network, abstracted to four lines on a 45° grid.
 *
 * Geometry is precomputed from OpenStreetMap and committed
 * (`cityNetworkGeometry.ts`) — this renders it and nothing else. Cities with
 * no network fall back to the bending template line so the card grid never
 * has a hole.
 *
 * Decorative: the card already carries the city name as its label.
 */
export function CityNetwork({ slug, index }: Props) {
  const network = slug ? CITY_NETWORKS[slug] : undefined;

  return (
    <svg
      viewBox={`0 0 ${NETWORK_VIEWBOX.w} ${NETWORK_VIEWBOX.h}`}
      className="my-2 w-full"
      aria-hidden
    >
      {network ? (
        <>
          {network.lines.map((line) => (
            <TrackLine key={line.ref} d={line.d} track={line.track} />
          ))}
          <Station x={network.interchange.x} y={network.interchange.y} />
        </>
      ) : (
        <g transform={`translate(0 ${TEMPLATE_SHIFT})`}>
          <TrackLine
            d={TEMPLATE_LINES[index % TEMPLATE_LINES.length]}
            track={TEMPLATE_TRACKS[index % TEMPLATE_TRACKS.length]}
          />
          <Station x={100} y={17} />
        </g>
      )}
    </svg>
  );
}
