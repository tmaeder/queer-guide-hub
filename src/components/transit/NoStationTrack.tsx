import { cn } from '@/lib/utils';

interface NoStationTrackProps {
  className?: string;
}

/**
 * The search modal's empty result: a line drawn as dashes, with one open ring
 * where the station would be.
 *
 * Distinct from [DeadEndTrack] on purpose, even though both say "nothing
 * here". The 404 knows which line it is on — you asked for a venue, so the
 * pink line runs and then stops — and its geometry is a working track that
 * ends. A search miss knows nothing: no type, no line, no place on the
 * network. So the whole path is dashed, there is no live segment, and the ring
 * is `open` rather than crossed out: it is a stop that has not been built yet,
 * which is exactly the invitation the caption makes.
 *
 * Pink, not ink, and this is the one deliberate exception to "colour appears
 * once" in the modal: pink is the only track that clears 3:1 against paper
 * unaided, so a bare dashed stroke in any other line would be a graphical
 * object failing WCAG 1.4.11 — and border-gating a dashed line is not a thing
 * that can be drawn.
 *
 * Decorative. The message is real HTML text next to it, never only in here.
 */
export function NoStationTrack({ className }: NoStationTrackProps) {
  return (
    <svg
      viewBox="0 0 300 70"
      role="presentation"
      aria-hidden="true"
      className={cn('h-auto w-full max-w-[220px]', className)}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      strokeLinecap="round"
    >
      {/* Bends, never straight — hard rule #1 holds even when the line is a
          line that does not exist. */}
      <path
        d="M 10 40 C 60 32 100 46 150 38 C 200 30 240 44 268 36"
        className="text-track-pink"
        stroke="currentColor"
        strokeWidth={8}
        strokeDasharray="2 20"
      />
      <circle
        cx="150"
        cy="38"
        r="10"
        strokeWidth={4}
        className="fill-background text-foreground"
        stroke="currentColor"
      />
    </svg>
  );
}
