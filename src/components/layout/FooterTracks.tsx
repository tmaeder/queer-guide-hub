import type { Track } from '@/components/transit/routeBulletMap';

/** `stroke-*` literals written out: Tailwind scans source text, and only
 *  `{bg,text,border,decoration}-track-*` is safelisted — a computed
 *  `stroke-track-${track}` would be purged and the lines would draw nothing.
 *  Same convention as CityNetwork.tsx. */
const TRACK_STROKE: Record<Track, string> = {
  pink: 'stroke-track-pink',
  blue: 'stroke-track-blue',
  green: 'stroke-track-green',
  yellow: 'stroke-track-yellow',
};

/** Where every line meets. Also where the station rings below hang. */
const HUB = { x: 600, y: 45 };

/**
 * Each line is authored as three cubic segments so its middle anchor is an
 * exact point on the curve — that is what lets a station ring sit ON the line
 * instead of near it. The previous drawing placed its rings by eye and called
 * them "crossings"; they were on a single path each, crossing nothing.
 */
const LINES: { track: Track; d: string }[] = [
  {
    track: 'pink',
    d: 'M -20 14 C 90 14 170 16 260 22 C 400 31 480 37 600 45 C 760 56 980 72 1220 70',
  },
  {
    track: 'blue',
    d: 'M -20 76 C 90 76 170 74 260 68 C 400 59 480 53 600 45 C 760 34 980 18 1220 20',
  },
  {
    track: 'green',
    d: 'M -20 45 C 150 45 300 42 440 44 C 500 44 550 44 600 45 C 760 47 900 40 1000 39 C 1100 38 1160 41 1220 42',
  },
  {
    track: 'yellow',
    d: 'M -20 62 C 150 60 320 53 460 49 C 510 47 560 46 600 45 C 800 40 1000 56 1220 54',
  },
];

/** Ordinary stops. Each is a middle anchor of the path above, so it is exactly
 *  on its own line at any render width. */
const STOPS = [
  { x: 260, y: 22 },
  { x: 260, y: 68 },
  { x: 1000, y: 39 },
];

/**
 * The four lines, converging on one interchange, then parting again.
 *
 * This replaces a drawing that showed TWO lines with rings that sat on the
 * paths rather than at any crossing — so the footer opened on a picture that
 * contradicted the six track columns underneath it and labelled two points
 * "stations" where nothing met.
 *
 * Every curve passes through {@link HUB}. That is not decoration: the footer is
 * the network seen all at once, and the interchange is where the six jobs below
 * meet — the same "Intersection" beat the homepage hero draws. It is also the
 * one sanctioned place all four tracks appear together, because at a
 * convergence the four colours ARE the vocabulary; anywhere else this would
 * break "one accent per context".
 *
 * Lines bend rather than run (hard rule #1) and are bare strokes with no ink
 * casing (2026-08-14: an outline reads as a border around a shape, not as a
 * route). The viewBox is wide and scales proportionally — `preserveAspectRatio`
 * must stay at the default `meet`, because `none` on a band this shallow
 * squashes every station ring into an ellipse.
 */
export function FooterTracks() {
  return (
    <svg
      viewBox="0 0 1200 90"
      className="block h-auto w-full"
      role="presentation"
      aria-hidden="true"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {LINES.map(({ track, d }) => (
        <path key={track} d={d} className={TRACK_STROKE[track]} strokeWidth={9} />
      ))}

      {/* Rings reverse on the ink plate: a paper-rimmed ink disc. An ink fill
          inside an ink rim on an ink footer is a hole, not a station. */}
      {STOPS.map(({ x, y }) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={8}
          className="fill-foreground stroke-background"
          strokeWidth={4}
        />
      ))}
      <circle
        cx={HUB.x}
        cy={HUB.y}
        r={14}
        className="fill-foreground stroke-background"
        strokeWidth={5}
      />
    </svg>
  );
}
