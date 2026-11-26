import { CheckCircle2, Compass, Target } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useMissions, type MissionStatus } from '@/hooks/useMissions';

interface MissionsRowProps {
  className?: string;
  /** Hide completed missions. Default: keep them, show as ticked. */
  hideCompleted?: boolean;
  /** Cap visible items. Default 6. */
  limit?: number;
}

function MissionCard({ mission }: { mission: MissionStatus }) {
  const pct = mission.target > 0 ? Math.min(1, mission.progress / mission.target) : 0;
  return (
    <article
      className="flex items-center gap-2.5 py-2.5"
      aria-label={`${mission.title}: ${mission.progress} of ${mission.target}`}
    >
      {mission.completed ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
      ) : (
        <Target className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              'truncate text-sm font-bold',
              mission.completed ? 'text-muted-foreground line-through' : 'text-foreground',
            )}
            title={mission.description}
          >
            {mission.title}
          </p>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {mission.progress}/{mission.target} · +{mission.points_reward}
          </span>
        </div>
        <div
          className="h-1 overflow-hidden rounded-badge bg-foreground/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct * 100)}
        >
          <div className="h-full bg-foreground" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
    </article>
  );
}

export function MissionsRow({ className, hideCompleted = false, limit = 6 }: MissionsRowProps) {
  const { data: missions = [], isLoading } = useMissions();

  if (isLoading) {
    return <div className={cn('h-32 rounded-container bg-card', className)} />;
  }

  const filtered = (hideCompleted ? missions.filter((m) => !m.completed) : missions).slice(
    0,
    limit,
  );
  if (filtered.length === 0) return null;

  return (
    <section
      className={cn('rounded-container bg-card px-4 py-2.5', className)}
      aria-label="Active missions"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
          <Compass className="h-4 w-4" aria-hidden /> Missions
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          {missions.filter((m) => m.completed).length}/{missions.length} done
        </span>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-x-6 divide-y divide-border p-0 md:grid-cols-2 md:divide-y-0">
        {filtered.map((m) => (
          <li key={m.slug}>
            <MissionCard mission={m} />
          </li>
        ))}
      </ul>
    </section>
  );
}
