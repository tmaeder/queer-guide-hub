import { useReadingStreak } from '@/hooks/useGuideReadingProgress';

/**
 * Plain-text reading streak caption. No flame, no shaming. Hidden when
 * streak < 2 — we don't notify on loss. Phase 5 §5.
 */
export function ReadingStreakCaption() {
  const { data: streak = 0 } = useReadingStreak();
  if (streak < 2) return null;
  return (
    <p className="text-13 text-muted-foreground my-3">
      {streak}-week reading streak.
    </p>
  );
}
