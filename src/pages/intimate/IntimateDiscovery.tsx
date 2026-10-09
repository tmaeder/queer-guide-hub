import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMyIntimateProfile, useIntimateDiscovery } from '@/hooks/useIntimateProfile';
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
import { JoyBurst } from '@/components/messaging/JoyBurst';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useKinkTaxonomy } from '@/hooks/useKinkTaxonomy';
import { IntimateDiscoveryFilters } from '@/components/intimate/IntimateDiscoveryFilters';
import { buildInterestOptions } from '@/lib/intimate/discoveryFilters';

export default function IntimateDiscovery({
  embedded = false,
  cityIdOverride,
}: {
  embedded?: boolean;
  cityIdOverride?: string;
}) {
  const { data: me, isLoading } = useMyIntimateProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  // Queer-joy burst on the mutual-match reveal itself — the same monochrome
  // confetti toolkit /messages uses for a match's first message, one step
  // earlier (2026-07 hub redesign; see CLAUDE.md's motion-zone exception).
  const [matchJoy, setMatchJoy] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [into, setInto] = useState<string[]>([]);
  const [ages, setAges] = useState<string[]>([]);
  const [bodies, setBodies] = useState<string[]>([]);
  const {
    data: kinkTaxonomy,
    isLoading: kinkTaxonomyLoading,
    isError: kinkTaxonomyError,
  } = useKinkTaxonomy(!!me?.opted_in_at);
  const interestOptions = useMemo(
    () =>
      kinkTaxonomy
        ? buildInterestOptions(kinkTaxonomy)
        : kinkTaxonomyError
          ? buildInterestOptions()
          : [],
    [kinkTaxonomy, kinkTaxonomyError],
  );
  const selectedKinkItemSlugs = useMemo(
    () => into.filter((value) => !value.startsWith('legacy:')),
    [into],
  );
  const selectedLegacyIntoTags = useMemo(
    () => into.filter((value) => value.startsWith('legacy:')).map((value) => value.slice(7)),
    [into],
  );

  useEffect(() => {
    if (!kinkTaxonomy || !into.some((value) => value.startsWith('legacy:'))) return;
    const byLegacyTag = new Map(
      interestOptions
        .filter((option) => option.legacyTag)
        .map((option) => [option.legacyTag as string, option.id]),
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect -- normalizes a temporary fallback selection after the richer remote vocabulary becomes available.
    setInto((current) => [
      ...new Set(
        current.map((value) =>
          value.startsWith('legacy:') ? (byLegacyTag.get(value.slice(7)) ?? value) : value,
        ),
      ),
    ]);
  }, [interestOptions, into, kinkTaxonomy]);
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

  const cityId = cityIdOverride ?? me?.discovery_city_id ?? null;
  const {
    data: cards,
    isLoading: loadingDisc,
    isError: discoveryError,
    refetch: retryDiscovery,
  } = useIntimateDiscovery({
    cityId,
    roles,
    intoTags: selectedLegacyIntoTags,
    kinkItemSlugs: selectedKinkItemSlugs,
    ageBands: ages,
    bodyTypes: bodies,
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
      setMatchJoy(true);
      toast({
        title: "It's a match",
        description: 'Open Messages to say hi.',
      });
    }
  });

  if (isLoading) {
    return (
      <DiscoveryShell embedded={embedded}>
        <PageLoadingState count={4} label="Loading your discovery line" />
      </DiscoveryShell>
    );
  }

  if (!me?.opted_in_at) {
    return (
      <DiscoveryShell embedded={embedded} form className="text-center">
        <h1 className="mb-4 text-2xl">Intimate</h1>
        <p className="mb-6 text-muted-foreground">
          You haven&apos;t opted into the intimate profile yet.
        </p>
        <Button onClick={() => navigate('/people/dating/onboarding')}>Get started</Button>
      </DiscoveryShell>
    );
  }

  return (
    <DiscoveryShell embedded={embedded} className="relative">
      {matchJoy && <JoyBurst onDone={() => setMatchJoy(false)} />}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        {embedded ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {loadingDisc
              ? 'Finding people…'
              : `${rankedCards.length} nearby ${rankedCards.length === 1 ? 'person' : 'people'}`}
          </p>
        ) : (
          <h1 className="text-2xl">Intimate</h1>
        )}
        <div className="flex flex-wrap items-center gap-4">
          {matches.length > 0 && (
            <Link to="/hub" className="text-sm underline">
              {matches.length} match{matches.length === 1 ? '' : 'es'}
            </Link>
          )}
          <Link to="/settings?tab=dating" className="text-sm underline">
            Edit my profile
          </Link>
          <div
            className="inline-flex rounded-element overflow-hidden bg-surface-container"
            role="tablist"
            aria-label="View mode"
          >
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

      <IntimateDiscoveryFilters
        roles={roles}
        onRolesChange={setRoles}
        interestOptions={interestOptions}
        interestsLoading={kinkTaxonomyLoading}
        interests={into}
        onInterestsChange={setInto}
        ages={ages}
        onAgesChange={setAges}
        bodies={bodies}
        onBodiesChange={setBodies}
      />

      {loadingDisc ? (
        <PageLoadingState count={4} label="Loading nearby riders" />
      ) : discoveryError ? (
        <div className="flex flex-wrap items-center gap-4 py-6" role="alert">
          <p className="text-sm text-muted-foreground">
            Nearby people could not be loaded. Your filters are still selected.
          </p>
          <Button variant="outline" size="sm" onClick={() => retryDiscovery()}>
            Try again
          </Button>
        </div>
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
        <ul className="">
          {rankedCards.map((c) => {
            const liked = likedSet.has(c.user_id);
            const matched = matchedSet.has(c.user_id);
            const score = scoreById.get(c.user_id);
            const shared = sharedById.get(c.user_id);
            return (
              <li key={c.user_id} className="">
                <div className="flex items-center gap-4 py-4">
                  <Link
                    to={`/people/dating/${c.user_id}`}
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
                        <span className="font-medium truncate">{c.display_name ?? 'Anon'}</span>
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
    </DiscoveryShell>
  );
}

function DiscoveryShell({
  embedded,
  form,
  className,
  children,
}: {
  embedded: boolean;
  form?: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (embedded) return <div className={className}>{children}</div>;
  return (
    <PageContainer size={form ? 'form' : undefined} className={className}>
      {children}
    </PageContainer>
  );
}
