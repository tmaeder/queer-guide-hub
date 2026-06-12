import { useMemo } from 'react';
import { Award } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useGamification } from '@/hooks/useGamification';
import { cn } from '@/lib/utils';

interface AchievementsRowProps {
  /** Max badges to display (earned ones win first). Default 8. */
  limit?: number;
  className?: string;
}

/**
 * Compact horizontal row of recent / earned achievements. Locked ones get a
 * muted variant. Tap-through lands on /me/progress for the full grid.
 *
 * Phase 1 only tracks venue-domain achievements; this row will surface more
 * domains as Phase 9 (quests + missions) wires them in.
 */
export function AchievementsRow({ limit = 8, className }: AchievementsRowProps) {
  const { achievements, catalog, loading } = useGamification();

  const earnedSet = useMemo(
    () => new Set(achievements.map((a) => a.achievement_slug)),
    [achievements],
  );

  const ordered = useMemo(() => {
    // Earned first (most recent earned to top), then locked by sort_order.
    const earnedSlugs = achievements
      .slice()
      .sort((a, b) => b.earned_at.localeCompare(a.earned_at))
      .map((a) => a.achievement_slug);
    const earnedEntries = earnedSlugs
      .map((slug) => catalog.find((c) => c.slug === slug))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const locked = catalog
      .filter((c) => !earnedSet.has(c.slug))
      .sort((a, b) => a.sort_order - b.sort_order);
    return [...earnedEntries, ...locked].slice(0, limit);
  }, [achievements, catalog, earnedSet, limit]);

  if (loading) {
    return (
      <div className={cn('h-24 rounded-container border border-border bg-card animate-pulse', className)} />
    );
  }

  if (ordered.length === 0) return null;

  return (
    <section
      className={cn('rounded-container border border-border bg-card p-4', className)}
      aria-label="Achievements"
    >
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-foreground inline-flex items-center gap-2">
          <Award className="h-4 w-4" aria-hidden /> Achievements
        </h3>
        <LocalizedLink to="/me/progress" className="text-13 text-muted-foreground hover:underline">
          See all
        </LocalizedLink>
      </div>
      <ul className="flex gap-4 overflow-x-auto pb-1">
        {ordered.map((a) => {
          const earned = earnedSet.has(a.slug);
          return (
            <li
              key={a.slug}
              className={cn(
                'flex shrink-0 w-32 flex-col items-center gap-1 rounded-element border border-border p-2 text-center',
                earned ? 'bg-card text-foreground' : 'bg-card/40 text-muted-foreground',
              )}
              title={`${a.name} — ${a.description}`}
            >
              <Award
                className={cn('h-5 w-5', earned ? 'text-foreground' : 'text-muted-foreground/60')}
                aria-hidden
              />
              <p className="line-clamp-2 text-13 font-medium">{a.name}</p>
              <p className="text-2xs tabular-nums text-muted-foreground">+{a.points_reward}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
