import { memo, useEffect, useRef, useState } from 'react';
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
/**
 * Line weight for `thumb` and `backdrop`, in SCREEN pixels (both use
 * `vector-effect: non-scaling-stroke`, because each crops to its own city's
 * bounding box and the same user-unit width would render at a different
 * thickness per city).
 *
 * The weight follows the diagram's rendered size, because the same component
 * draws everything from a 48px search thumbnail to a ~300px city-card header
 * to a full masthead backdrop. A single fixed width was always wrong
 * somewhere: 2.5px read as a hairline on the city cards, and any weight that
 * read well there would clog a 48px thumb. It is the shorter side of the
 * rendered box times LINE_PX_PER_BOX_PX (0.04: the homepage city card, 153px
 * tall at a 1440px viewport, lands on the 6px it shipped with), clamped to [MIN, MAX]. The 4.5px floor was chosen by eye against the 96px-tall
 * /going-out tiles, where 3.5px read as a hairline, and still holds in 48px thumbs.
 */
const LINE_PX_PER_BOX_PX = 0.04;
const MIN_LINE_PX = 4.5;
const MAX_LINE_PX = 7;
/** Used until the first measurement lands, and where ResizeObserver is absent. */
const FALLBACK_LINE_PX = 4.5;

export function lineWidthForBox(width: number, height: number): number {
  const side = Math.min(width, height);
  if (!(side > 0)) return FALLBACK_LINE_PX;
  const px = side * LINE_PX_PER_BOX_PX;
  return Math.round(Math.min(MAX_LINE_PX, Math.max(MIN_LINE_PX, px)) * 2) / 2;
}

/** Measures the rendered box and returns the line weight for it. */
function useBoxLineWidth(enabled: boolean) {
  const ref = useRef<SVGSVGElement>(null);
  const [px, setPx] = useState(FALLBACK_LINE_PX);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setPx(lineWidthForBox(width, height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);
  return { ref, px };
}

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
  | 'thumb'
  /** Cropped like `thumb` but heavier and anchored right, for drawing the
   *  city's own network behind a page masthead (`/city/:slug`). Never falls
   *  back to the template line — a backdrop that is the same for every
   *  unmapped city would not be city-specific. */
  | 'backdrop';

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
  /**
   * Line weight in SCREEN pixels for `thumb` / `backdrop`. The thumb default
   * is sized for small slots (48–112px tall); a large picture slot such as a
   * city card's 16:10 header renders the same network several times bigger
   * and needs a heavier line to read as a route rather than a hairline.
   *
   * Optional and normally omitted: without it the weight follows the
   * rendered box size (see `lineWidthForBox`). Pass it only to pin a weight.
   */
  lineWidth?: number;
}

function TrackLine({ d, track, strokePx }: { d: string; track: Track; strokePx?: number }) {
  return (
    <path
      d={d}
      fill="none"
      className={TRACK_STROKE[track]}
      strokeWidth={strokePx ?? LINE_WIDTH}
      vectorEffect={strokePx ? 'non-scaling-stroke' : undefined}
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
function CityNetworkImpl({ slug, variant = 'card', index, lineWidth, className }: Props) {
  const network = slug ? CITY_NETWORKS[slug] : undefined;
  const sized = variant !== 'card' && !!network && lineWidth === undefined;
  // Called before any early return: hooks must run in the same order every render.
  const box = useBoxLineWidth(sized);

  if (!network) {
    if (index === undefined || variant === 'backdrop') return null;
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

  const backdrop = variant === 'backdrop';
  const thumb = variant === 'thumb' || backdrop;
  const strokePx = thumb ? (lineWidth ?? box.px) : undefined;
  const { crop } = network;
  // The ring is drawn in user units, and the thumb's units differ per city, so
  // scale it off the crop instead of hard-coding a radius that would be a dot
  // on a sprawling network and a blob on a compact one.
  const stationRadius = thumb ? Math.max(crop.w, crop.h) * 0.055 : 6;

  return (
    <svg
      ref={box.ref}
      viewBox={
        thumb
          ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}`
          : `0 0 ${NETWORK_VIEWBOX.w} ${NETWORK_VIEWBOX.h}`
      }
      preserveAspectRatio={backdrop ? 'xMaxYMid meet' : 'xMidYMid meet'}
      className={cn(thumb ? 'h-full w-full' : 'my-2 w-full', className)}
      aria-hidden
    >
      {network.lines.map((line) => (
        <TrackLine key={line.ref} d={line.d} track={line.track} strokePx={strokePx} />
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
