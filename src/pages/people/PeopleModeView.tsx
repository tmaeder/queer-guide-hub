import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePeopleDiscovery, type PeopleMode } from '@/hooks/usePeopleDiscovery';
import { useFriendProfiles } from '@/hooks/useFriendProfiles';
import { PersonCard, type PersonCardData } from '@/components/people/PersonCard';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * One ranked people grid, driven by the shared matching engine. Used for the
 * friends / travel / nearby tabs of the People hub (dating has its own deck).
 * The RPC owns all gating (block, visibility, presence opt-in); this view just
 * renders the ranked result or an honest empty state.
 */
export function PeopleModeView({ mode, emptyHint }: { mode: PeopleMode; emptyHint: string }) {
  const { user } = useAuth();
  const { data: matches = [], isLoading } = usePeopleDiscovery({ mode, limit: 60 });

  const ids = useMemo(() => matches.map((m) => m.userId), [matches]);
  const profiles = useFriendProfiles(ids, ids.length > 0);

  const cards = useMemo<PersonCardData[]>(() => {
    const byId = new Map(profiles.map((p) => [p.user_id, p]));
    return matches.map((m) => ({
      userId: m.userId,
      displayName: byId.get(m.userId)?.display_name,
      avatarUrl: byId.get(m.userId)?.avatar_url ?? null,
      score: m.score,
      shared: m.shared,
    }));
  }, [matches, profiles]);

  if (!user) {
    return (
      <p className="text-muted-foreground">Sign in to find people.</p>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-element" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return <p className="text-muted-foreground">{emptyHint}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {cards.map((c) => (
        <PersonCard key={c.userId} person={c} fullWidth />
      ))}
    </div>
  );
}
