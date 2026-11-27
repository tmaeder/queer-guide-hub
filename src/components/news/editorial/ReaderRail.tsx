import { useAuth } from '@/hooks/useAuth';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ReadingStreak } from '@/components/news/reader/ReadingStreak';
import { SavedCount } from '@/components/news/reader/SavedCount';

export function ReaderRail() {
  const { user, loading } = useAuth();
  // Signed out: nothing. The shelf only exists once there is something on it.
  if (loading || !user) return null;

  return (
    <aside aria-label="Reader rail" className="flex flex-col gap-4">
      <ReadingStreak />
      <SavedCount />
      <LocalizedLink
        to="/hub/progress"
        className="text-13 uppercase tracking-wider no-underline text-foreground hover:underline self-start"
      >
        Your full shelf →
      </LocalizedLink>
    </aside>
  );
}
