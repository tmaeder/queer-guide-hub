import { memo } from 'react';
import type { Track } from '@/components/transit/routeBulletMap';
import { cn } from '@/lib/utils';
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
/** Screen pixels, not user units: the thumb variant crops to each city's own
 *  bounding box, so the same user-unit width would render at a different
 *  thickness per city. `vector-effect: non-scaling-stroke` pins it instead. */
const THUMB_LINE_PX = 2.5;

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

type Variant =
  /** Full 200x110 frame, sized by width. Homepage tiles, directory cards. */
  | 'card'
  /** Cropped to the city's own bounding box and fitted to the container, for
   *  square or small boxes where the full frame would letterbox to nothing. */
  | 'thumb';

interface Props {
  /** `cities.slug` — the key into the generated geometry. */
  slug: string | null | undefined;
  variant?: Variant;
  className?: string;
  /**
   * Which template line to draw when this city has no committed network.
   *
   * On the homepage this is the card position, which is fine for eight fixed
   * cards. On /cities it MUST NOT be — `index % 4` across a 4-column grid gives
   * every card in column 1 the same shape in the same colour, so the page draws
   * four vertical monochrome stripes; and because filtering and sorting reshuffle
   * positions, every card's shape and colour would change under the reader.
   * `templateIndexFor(slug)` from ./templateIndex is the stable alternative.
   *
   * OPTIONAL. Supplying it opts into the template line; without it a city with
   * no network renders nothing and the call site keeps its own placeholder —
   * which is what every surface outside the homepage and /cities wants, since
   * the diagram is only ever an upgrade over a meaningless placeholder.
   */
  index?: number;
}

function TrackLine({ d, track, thumb }: { d: string; track: Track; thumb?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      className={TRACK_STROKE[track]}
      strokeWidth={thumb ? THUMB_LINE_PX : LINE_WIDTH}
      vectorEffect={thumb ? 'non-scaling-stroke' : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** The station ring — paper disc, ink rim, the same mark the rest of the
 *  system uses for a stop. */
function Station({ x, y, r = 6 }: { x: number; y: number; r?: number }) {
  return (
    <circle cx={x} cy={y} r={r} className="fill-background stroke-foreground" strokeWidth={r / 2} />
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
function CityNetworkImpl({ slug, variant = 'card', index, className }: Props) {
  const network = slug ? CITY_NETWORKS[slug] : undefined;

  if (!network) {
    if (index === undefined) return null;
    return (
      <svg
        viewBox={`0 0 ${NETWORK_VIEWBOX.w} ${NETWORK_VIEWBOX.h}`}
        className={cn('my-2 w-full', className)}
        aria-hidden
      >
        <g transform={`translate(0 ${TEMPLATE_SHIFT})`}>
          <TrackLine
            d={TEMPLATE_LINES[index % TEMPLATE_LINES.length]}
            track={TEMPLATE_TRACKS[index % TEMPLATE_TRACKS.length]}
          />
          <Station x={100} y={17} />
        </g>
      </svg>
    );
  }

  const thumb = variant === 'thumb';
  const { crop } = network;
  // The ring is drawn in user units, and the thumb's units differ per city, so
  // scale it off the crop instead of hard-coding a radius that would be a dot
  // on a sprawling network and a blob on a compact one.
  const stationRadius = thumb ? Math.max(crop.w, crop.h) * 0.055 : 6;

  return (
    <svg
      viewBox={
        thumb
          ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}`
          : `0 0 ${NETWORK_VIEWBOX.w} ${NETWORK_VIEWBOX.h}`
      }
      preserveAspectRatio="xMidYMid meet"
      className={cn(thumb ? 'h-full w-full' : 'my-2 w-full', className)}
      aria-hidden
    >
      {network.lines.map((line) => (
        <TrackLine key={line.ref} d={line.d} track={line.track} thumb={thumb} />
      ))}
      <Station x={network.interchange.x} y={network.interchange.y} r={stationRadius} />
    </svg>
  );
}

/**
 * Memoized: the homepage draws eight of these, but /cities draws one per card in a
 * virtualized grid whose row containers re-render on every scroll tick, and whose
 * parent re-renders on every keystroke in the search box. The props are two
 * primitives, so the comparison is free and the win is real.
 */
export const CityNetwork = memo(CityNetworkImpl);
