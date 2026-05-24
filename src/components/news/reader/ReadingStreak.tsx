import { useReadingStreak } from '@/hooks/useReadingStreak';
import { Flame } from 'lucide-react';

export function ReadingStreak() {
  const { streak, loading } = useReadingStreak();
  if (loading || !streak) {
    return (
      <div className="border border-border rounded-container p-6">
        <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">
          Reading streak
        </p>
        <p className="mt-4 text-display font-bold leading-none tracking-tight tabular-nums">—</p>
      </div>
    );
  }

  const current = streak.current_streak;
  const longest = streak.longest_streak;

  return (
    <div className="border border-border rounded-container p-6">
      <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
        <Flame size={12} aria-hidden="true" />
        Reading streak
      </p>
      <p className="mt-4 m-0 text-hero font-bold leading-none tracking-tight tabular-nums">
        {current}
        <span className="ml-2 text-base font-medium text-muted-foreground">
          {current === 1 ? 'day' : 'days'}
        </span>
      </p>
      {current === 0 ? (
        <p className="mt-3 text-13 text-muted-foreground leading-snug">
          Read one story today to start a streak.
        </p>
      ) : (
        <p className="mt-3 text-13 text-muted-foreground leading-snug">
          Longest: {longest} {longest === 1 ? 'day' : 'days'}
        </p>
      )}
    </div>
  );
}
