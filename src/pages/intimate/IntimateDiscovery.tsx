import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  useMyIntimateProfile,
  useIntimateDiscovery,
} from '@/hooks/useIntimateProfile';
import { usePeopleDiscovery } from '@/hooks/usePeopleDiscovery';
import {
  useIntimateMatches,
  useMyIntimateLikes,
  useMyIntimatePasses,
  useLikeTarget,
  usePassTarget,
  useIncomingLikeListener,
} from '@/hooks/useIntimateMatches';
import { Button } from '@/components/ui/button';
import { SignalChips } from '@/components/people/SignalChips';
import type { PeopleMatchShared } from '@/hooks/usePeopleDiscovery';
import { LikePassActions } from '@/components/intimate/LikePassActions';
import { SwipeDeck, type SwipeableCard } from '@/components/intimate/SwipeDeck';
import { useToast } from '@/hooks/use-toast';
import { AGE_BANDS, BODY_TYPES, INTO_TAGS, ROLES } from '@/assets/intimate/options';

export default function IntimateDiscovery() {
  const { data: me, isLoading } = useMyIntimateProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [roles, setRoles] = useState<string[]>([]);
  const [into, setInto] = useState<string[]>([]);
  const [ages, setAges] = useState<string[]>([]);
  const [bodies, setBodies] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'deck'>(() => {
    if (typeof window === 'undefined') return 'grid';
    return (localStorage.getItem('discoverViewMode') as 'grid' | 'deck') || 'grid';
  });
  useEffect(() => {
    try {
      localStorage.setItem('discoverViewMode', viewMode);
    } catch {
      /* storage disabled — ignore */
    }
  }, [viewMode]);

  const cityId = me?.discovery_city_id ?? null;
  const { data: cards, isLoading: loadingDisc } = useIntimateDiscovery({
    cityId, roles, intoTags: into, ageBands: ages, bodyTypes: bodies,
  });

  const { data: likedIds = [] } = useMyIntimateLikes();
  const { data: passedIds = [] } = useMyIntimatePasses();
  const { data: matches = [] } = useIntimateMatches();
  const likeMutation = useLikeTarget();
  const passMutation = usePassTarget();

  const likedSet = useMemo(() => new Set(likedIds), [likedIds]);
  const passedSet = useMemo(() => new Set(passedIds), [passedIds]);
  const matchedSet = useMemo(() => new Set(matches.map((m) => m.other_id)), [matches]);

  // Hide profiles the user has already passed on — keep liked ones visible
  // (status shifts to "Liked" / "Matched") so feedback stays anchored.
  const visibleCards = useMemo(
    () => (cards ?? []).filter((c) => !passedSet.has(c.user_id)),
    [cards, passedSet],
  );

  // Compatibility ranking — reorders the same opted-in/approved cards by the
  // shared people-matching engine. The view + filters still own which profiles
  // appear (safety/eligibility wall); this only changes their order. Falls back
  // to the view's own order when the RPC has nothing to say.
  const { data: ranked } = usePeopleDiscovery({
    mode: 'dating',
    cityId: cityId ?? undefined,
    limit: 200,
    enabled: !!me?.opted_in_at,
  });
  const rankIndex = useMemo(() => {
    const m = new Map<string, number>();
    (ranked ?? []).forEach((r, i) => m.set(r.userId, i));
    return m;
  }, [ranked]);
  const scoreById = useMemo(() => {
    const m = new Map<string, number>();
    (ranked ?? []).forEach((r) => m.set(r.userId, r.score));
    return m;
  }, [ranked]);
  const sharedById = useMemo(() => {
    const m = new Map<string, PeopleMatchShared>();
    (ranked ?? []).forEach((r) => m.set(r.userId, r.shared));
    return m;
  }, [ranked]);
  const rankedCards = useMemo(() => {
    if (!rankIndex.size) return visibleCards;
    const at = (id: string) => rankIndex.get(id) ?? Number.MAX_SAFE_INTEGER;
    return [...visibleCards].sort((a, b) => at(a.user_id) - at(b.user_id));
  }, [visibleCards, rankIndex]);

  useIncomingLikeListener((row) => {
    // If the receiver has already liked the sender, the trigger creates a
    // conversation and this row indicates the moment of mutual match.
    if (likedSet.has(row.actor_id)) {
      toast({
        title: "It's a match",
        description: 'Open Messages to say hi.',
      });
    }
  });

  if (isLoading) return <div className="p-8">Loading…</div>;

  if (!me?.opted_in_at) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="mb-4 text-2xl">Intimate</h1>
        <p className="mb-6 text-muted-foreground">
          You haven&apos;t opted into the intimate profile yet.
        </p>
        <Button onClick={() => navigate('/intimate/onboard')}>Get started</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl">Intimate</h1>
        <div className="flex items-center gap-4">
          {matches.length > 0 && (
            <Link to="/messages" className="text-sm underline">
              {matches.length} match{matches.length === 1 ? '' : 'es'}
            </Link>
          )}
          <Link to="/settings?tab=dating" className="text-sm underline">
            Edit my profile
          </Link>
          <div className="inline-flex rounded-element border border-border overflow-hidden" role="tablist" aria-label="View mode">
            {(['grid', 'deck'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={viewMode === m}
                onClick={() => setViewMode(m)}
                className={
                  viewMode === m
                    ? 'bg-foreground text-background px-2.5 py-1 text-13 capitalize'
                    : 'bg-card text-foreground px-2.5 py-1 text-13 capitalize hover:bg-muted/40'
                }
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="mb-6 space-y-4 border-b pb-4">
        <FilterRow label="Role" options={ROLES as readonly string[]} selected={roles} onToggle={(v) => setRoles(toggle(roles, v))} />
        <FilterRow label="Into" options={INTO_TAGS as readonly string[]} selected={into} onToggle={(v) => setInto(toggle(into, v))} />
        <FilterRow label="Age" options={AGE_BANDS as readonly string[]} selected={ages} onToggle={(v) => setAges(toggle(ages, v))} />
        <FilterRow label="Body" options={BODY_TYPES as readonly string[]} selected={bodies} onToggle={(v) => setBodies(toggle(bodies, v))} />
      </section>

      {loadingDisc ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !rankedCards.length ? (
        <p className="text-muted-foreground">No matches yet. Try widening filters.</p>
      ) : viewMode === 'deck' ? (
        <SwipeDeck
          cards={rankedCards
            .filter((c) => !likedSet.has(c.user_id))
            .map<SwipeableCard>((c) => ({
              id: c.user_id,
              avatar_url: c.avatar_url,
              display_name: c.display_name,
              age_band: c.age_band,
              body_type: c.body_type,
              height_cm: c.height_cm,
              role: c.role,
            }))}
          onLike={(id) => likeMutation.mutate(id)}
          onPass={(id) => passMutation.mutate(id)}
        />
      ) : (
        <ul className="border-t border-border">
          {rankedCards.map((c) => {
            const liked = likedSet.has(c.user_id);
            const matched = matchedSet.has(c.user_id);
            const score = scoreById.get(c.user_id);
            const shared = sharedById.get(c.user_id);
            return (
              <li key={c.user_id} className="border-b border-border">
                <div className="flex items-center gap-4 py-4">
                  <Link
                    to={`/intimate/u/${c.user_id}`}
                    className="flex flex-1 min-w-0 items-center gap-4 transition-colors hover:bg-muted/40"
                  >
                    {c.avatar_url ? (
                      <img
                        src={c.avatar_url}
                        alt=""
                        className="h-12 w-12 object-cover rounded-element"
                      />
                    ) : (
                      <div className="h-12 w-12 bg-muted rounded-element" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {c.display_name ?? 'Anon'}
                        </span>
                        {typeof score === 'number' && score > 0 ? (
                          <span className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground rounded-badge bg-muted px-1.5 py-0.5">
                            {score}% match
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[c.age_band, c.body_type, c.height_cm ? `${c.height_cm}cm` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      {c.role?.length ? (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {c.role.join(', ')}
                        </div>
                      ) : null}
                      <SignalChips shared={shared} className="mt-1.5" max={2} />
                    </div>
                  </Link>
                  <LikePassActions
                    onLike={() => likeMutation.mutate(c.user_id)}
                    onPass={() => passMutation.mutate(c.user_id)}
                    liked={liked}
                    matched={matched}
                    disabled={likeMutation.isPending || passMutation.isPending}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function toggle(arr: string[], v: string) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function FilterRow({
  label, options, selected, onToggle,
}: {
  label: string; options: readonly string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <Button
              key={o}
              size="sm"
              variant={on ? 'default' : 'outline'}
              onClick={() => onToggle(o)}
              className="rounded-element"
            >{o.replace(/_/g, ' ')}</Button>
          );
        })}
      </div>
    </div>
  );
}
