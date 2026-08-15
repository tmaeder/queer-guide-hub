/**
 * The closing band: ONE line, bending, with two stops.
 *
 * It was four lines. That does not work at a footer's proportions, and both
 * attempts failed in opposite directions:
 *
 *  - Tall enough for four lines to separate (108px at a 1440 viewport), they
 *    converged on a single interchange and read as a knot — and 108px of
 *    decoration above an already-long footer was the single biggest
 *    contributor to the whole thing feeling cluttered.
 *  - Shallow enough not to dominate (43px), the band is ~33:1. At that aspect
 *    the bends flatten below perception and four parallel colours read as a
 *    rainbow STRIPE — a decorative gradient bar, not a map.
 *
 * The source mock's four-line hero is ~4.5:1 (1440×320); it can afford them.
 * A footer cannot. So this is one line with the vertical room to actually
 * bend, which is what makes it read as track — hard rule #1, and the reason
 * the rule exists. All four colours still appear in the footer, on the six
 * column swatches below, where they do real wayfinding work.
 *
 * Pink because it is the flagship line and the only track that clears 3:1
 * unaided, so it needs no ink casing (which would read as a border around a
 * shape rather than as a route).
 */

/** Both stops are exact path ANCHORS, so each ring sits ON the line at any
 *  render width rather than near it. */
const STOPS = [
  { x: 420, y: 14 },
  { x: 880, y: 42 },
];

const LINE = 'M -20 38 C 150 38 240 14 420 14 C 600 14 700 42 880 42 C 1030 42 1120 20 1220 20';

export function FooterTracks() {
  return (
    <svg
      viewBox="0 0 1200 56"
      className="block h-auto w-full"
      role="presentation"
      aria-hidden="true"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={LINE} className="stroke-track-pink" strokeWidth={6} />

      {/* Paper-rimmed ink discs: on the footer's ink plate an ink fill inside
          an ink rim is a hole, not a station. */}
      {STOPS.map(({ x, y }) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={8}
          className="fill-foreground stroke-background"
          strokeWidth={3}
        />
      ))}
    </svg>
  );
}
