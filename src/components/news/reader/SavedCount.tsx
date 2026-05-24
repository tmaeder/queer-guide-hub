import { useFavorites } from '@/hooks/useFavorites';
import { Bookmark } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

export function SavedCount() {
  const { favoriteIds } = useFavoritesSafe();
  const count = favoriteIds.size;

  return (
    <LocalizedLink
      to="/favorites"
      className="block border border-border rounded-container p-6 no-underline text-inherit hover:bg-muted transition-colors"
    >
      <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
        <Bookmark size={12} aria-hidden="true" />
        Saved articles
      </p>
      <p className="mt-4 m-0 text-hero font-bold leading-none tracking-tight tabular-nums">
        {count}
      </p>
      <p className="mt-3 text-13 text-muted-foreground leading-snug">
        {count === 0 ? 'Tap the heart on any article to save.' : 'Open reading list →'}
      </p>
    </LocalizedLink>
  );
}

// Thin wrapper so we can swap implementations later without re-typing the
// hook everywhere. Today this is just useFavorites('news').
function useFavoritesSafe() {
  const { favoriteIds } = useFavorites('news') as unknown as { favoriteIds: Set<string> };
  return { favoriteIds: favoriteIds ?? new Set<string>() };
}
