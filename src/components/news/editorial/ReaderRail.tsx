import { useAuth } from '@/hooks/useAuth';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ReadingStreak } from '@/components/news/reader/ReadingStreak';
import { SavedCount } from '@/components/news/reader/SavedCount';

export function ReaderRail() {
  const { user, loading } = useAuth();
  if (loading) return null;

  if (!user) {
    return (
      <aside
        aria-label="Reader rail"
        className="border border-border rounded-container p-6 flex flex-col gap-4"
      >
        <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">Your shelf</p>
        <p className="text-base leading-snug m-0">
          Sign in to build a reading streak, save stories, and pick up where you left off.
        </p>
        <LocalizedLink
          to="/auth?intent=signin"
          className="inline-flex w-fit items-center rounded-element bg-foreground text-background px-4 py-2 text-sm font-semibold no-underline hover:opacity-90"
          style={{ color: 'hsl(var(--background))' }}
        >
          Sign in
        </LocalizedLink>
      </aside>
    );
  }

  return (
    <aside aria-label="Reader rail" className="flex flex-col gap-4">
      <ReadingStreak />
      <SavedCount />
    </aside>
  );
}
