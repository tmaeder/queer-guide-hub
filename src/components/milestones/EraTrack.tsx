import type { HistoryEra } from '@/config/historyEras';
import { cn } from '@/lib/utils';
import { MilestoneRow } from './MilestoneRow';
import type { Milestone } from '@/types/milestone';

/**
 * One era's milestones strung along the line as stations.
 *
 * Extracted from EraSection because the chapter renders its spine twice (the
 * collapsed major-milestone list and the expanded full chronology), and
 * because the old inline version carried an uncommented `-ml-[31px]` on every
 * row — a magic offset hand-calibrated against a 1px border, `gap-4` and a 12px
 * marker, with no test. Any change to the row silently misaligned the whole
 * page. Here the rail and the row's marker column are both centred in the SAME
 * 16px (`w-4`), so alignment is a shared constant rather than arithmetic, and
 * it is RTL-correct for free because nothing is translated.
 *
 * The rail is straight, deliberately. Row heights are content-driven, so a
 * bending SVG here would need `preserveAspectRatio="none"` and would deform the
 * stroke by a different amount in every chapter. The bend belongs to the
 * illustrative diagram in EraLineNav; the functional rail stays straight — the
 * same split IntentMap makes.
 */
export function EraTrack({
  era,
  milestones,
  className,
}: {
  era: HistoryEra;
  milestones: Milestone[];
  className?: string;
}) {
  if (!milestones.length) return null;

  return (
    <ol className={cn('relative m-0 list-none p-0', className)}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 start-0 flex w-4 justify-center"
      >
        {/* The line goes dark across persecution chapters — same rule as
            eraStroke, expressed here as a class because this rail is a div,
            not an SVG stroke. */}
        <span className={cn('w-[3px]', era.restrained ? 'bg-foreground' : 'bg-track-pink')} />
      </span>
      {milestones.map((m) => (
        // `relative` is load-bearing: the rail is absolutely positioned and
        // would otherwise paint over the station markers.
        <li key={m.id} className="relative py-4 first:pt-0 last:pb-0">
          <MilestoneRow milestone={m} marker="station" />
        </li>
      ))}
    </ol>
  );
}
