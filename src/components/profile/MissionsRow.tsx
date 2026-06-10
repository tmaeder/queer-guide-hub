import { CheckCircle2, Compass, Target } from 'lucide-react';
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
      className={cn(
        'flex flex-col gap-2 rounded-element border border-border p-4 min-w-[200px]',
        mission.completed ? 'bg-card' : 'bg-card/60',
      )}
      aria-label={`${mission.title}: ${mission.progress} of ${mission.target}`}
    >
      <header className="flex items-start gap-2">
        {mission.completed ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
        ) : (
          <Target className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground line-clamp-1">{mission.title}</p>
          <p className="text-13 text-muted-foreground line-clamp-2">{mission.description}</p>
        </div>
      </header>
      <div className="flex items-center justify-between gap-2 text-13 text-muted-foreground">
        <span className="tabular-nums">
          {mission.progress}/{mission.target}
        </span>
        <span className="tabular-nums">+{mission.points_reward} pts</span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-badge bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
      >
        <div
          className="h-full bg-foreground transition-[width] duration-500"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </article>
  );
}

export function MissionsRow({ className, hideCompleted = false, limit = 6 }: MissionsRowProps) {
  const { data: missions = [], isLoading } = useMissions();

  if (isLoading) {
    return (
      <div className={cn('h-32 rounded-container border border-border bg-card animate-pulse', className)} />
    );
  }

  const filtered = (hideCompleted ? missions.filter((m) => !m.completed) : missions).slice(0, limit);
  if (filtered.length === 0) return null;

  return (
    <section
      className={cn('rounded-container border border-border bg-card p-4', className)}
      aria-label="Active missions"
    >
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-foreground inline-flex items-center gap-2">
          <Compass className="h-4 w-4" aria-hidden /> Missions
        </h3>
        <span className="text-13 text-muted-foreground tabular-nums">
          {missions.filter((m) => m.completed).length}/{missions.length} done
        </span>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {filtered.map((m) => (
          <li key={m.slug}>
            <MissionCard mission={m} />
          </li>
        ))}
      </ul>
    </section>
  );
}
