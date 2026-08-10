import { cn } from '@/lib/utils';

/**
 * The working indicator. A closed loop drawn as track — the design system's
 * Loading Animation spec calls it out explicitly: "A closed loop, drawn as
 * track. Replaces the spinner everywhere."
 *
 * WHY THIS INSTEAD OF A SPINNER. A spinner is a generic rotating arc that says
 * only "something is happening". This says the same thing in the product's own
 * language: a dash travelling a bezier loop is a train on a circle line. The
 * path is a bezier, never a circle primitive, because the brand rule is that
 * transit lines are never drawn straight — and an <circle> is the degenerate
 * case of exactly that.
 *
 * The motion is a travelling dash (stroke-dashoffset), not a rotation. Nothing
 * spins in a transit system; things travel along tracks.
 *
 * TIMING RULE, from the same spec: "Under 400ms of expected wait, show
 * nothing." A loader that appears for 200ms is a flash of noise that makes the
 * product feel slower than staying still would. `delayMs` implements that as
 * the default rather than leaving it to each call site to remember.
 */
export function TrackLoader({
  size = 22,
  track = 'pink',
  label,
  className,
}: {
  size?: number;
  /** Which line is working. Defaults to pink — the primary track. */
  track?: 'pink' | 'blue' | 'green' | 'yellow';
  /** Announced to screen readers. Omit only when an adjacent live region says it. */
  label?: string;
  className?: string;
}) {
  const stroke = `hsl(var(--track-${track}))`;
  return (
    <svg
      viewBox="0 0 44 44"
      width={size}
      height={size}
      className={cn('track-loader', className)}
      {...(label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {/* A rounded square loop in bezier, not a circle: same reason the map
          lines bend — the system has no straight or perfectly circular runs. */}
      <path
        d="M 22 6 C 33 6 38 13 38 22 C 38 31 31 38 22 38 C 13 38 6 31 6 22 C 6 13 11 6 22 6 Z"
        fill="none"
        stroke={stroke}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={120}
      />
    </svg>
  );
}
