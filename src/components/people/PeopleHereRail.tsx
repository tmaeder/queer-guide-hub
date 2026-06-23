import { useMemo } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useStatus } from '@/hooks/useStatus';
import { usePeopleDiscovery, type PeopleMode } from '@/hooks/usePeopleDiscovery';
import { useFriendProfiles } from '@/hooks/useFriendProfiles';
import { PersonCard, type PersonCardData } from '@/components/people/PersonCard';

interface PeopleHereRailProps {
  mode: PeopleMode;
  cityId?: string;
  eventId?: string;
  tripId?: string;
  title: string;
  /** Where "See all" links to. */
  seeAllHref?: string;
  /** Max cards in the rail. */
  limit?: number;
}

/**
 * Place-anchored "people to meet" rail — one component, mounted on city / event
 * / trip surfaces, all driven by the shared people-matching engine
 * (people_discovery). Place context (city/event/trip) requires the viewer to
 * have opted into discovery presence; we never leak people onto a place page.
 * Renders nothing when signed-out, not opted-in, or there's no one to show.
 */
export function PeopleHereRail({
  mode,
  cityId,
  eventId,
  tripId,
  title,
  seeAllHref,
  limit = 8,
}: PeopleHereRailProps) {
  const { user } = useAuth();
  const { status } = useStatus();
  const isPlaceContext = Boolean(cityId || eventId || tripId);
  const optedIntoDiscovery = Boolean(status?.visibility?.in_discovery);
  // The RPC also enforces this server-side; gating the query avoids a wasted
  // round-trip and keeps the rail invisible until the viewer participates.
  const enabled = Boolean(user) && (!isPlaceContext || optedIntoDiscovery);

  const { data: matches = [], isLoading } = usePeopleDiscovery({
    mode,
    cityId,
    eventId,
    tripId,
    limit,
    enabled,
  });

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

  if (!enabled) return null;
  if (isLoading || cards.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-title font-display">{title}</h2>
        {seeAllHref ? (
          <Link to={seeAllHref} className="text-sm text-muted-foreground hover:text-foreground">
            See all
          </Link>
        ) : null}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {cards.map((c) => (
          <PersonCard key={c.userId} person={c} />
        ))}
      </div>
    </section>
  );
}
