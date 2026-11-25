import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMyIntimateProfile, useIntimateDiscovery } from '@/hooks/useIntimateProfile';
import { hasSeeking, seekingToFilters } from '@/lib/intimate/seeking';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useDatingMatchingSettings } from '@/hooks/useDatingMatching';
import {
  useIntimateMatches,
  useMyIntimateLikes,
  useMyIntimatePasses,
  useLikeTarget,
  usePassTarget,
  useIncomingLikeListener,
} from '@/hooks/useIntimateMatches';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Heart, Layers, LayoutGrid, MapPin, Pencil } from '@/components/icons';
import { LivePresenceControl } from '@/components/people/LivePresenceControl';
import { useNearMe } from '@/hooks/useNearMe';
import { cn } from '@/lib/utils';
import type { IntimateDiscoveryCard } from '@/lib/intimate/types';
import { useMyHankySignals } from '@/hooks/useHankySignals';
import { hankyMatches } from '@/lib/intimate/hankyChecks';
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
  const {
    data: matchingSettings,
    isLoading: loadingSettings,
    error: settingsError,
  } = useDatingMatchingSettings();
  const navigate = useNavigate();
  const { toast } = useToast();
  // Queer-joy burst on the mutual-match reveal itself — the same monochrome
  // confetti toolkit /messages uses for a match's first message, one step
  // earlier (2026-07 hub redesign; see CLAUDE.md's motion-zone exception).
  const [matchJoy, setMatchJoy] = useState(false);
  // Render time is fixed per mount; "active now" does not need to tick.
  const [now] = useState(Date.now);
  const [roles, setRoles] = useState<string[]>([]);
  const [into, setInto] = useState<string[]>([]);
  const [ages, setAges] = useState<string[]>([]);
  const [bodies, setBodies] = useState<string[]>([]);
  const [genitalia, setGenitalia] = useState<string[]>([]);
  const [hanky, setHanky] = useState<Record<string, 'left' | 'right' | 'both'>>({});
  const { data: myHanky } = useMyHankySignals();
  // Saved seeking filters remain server-side requirements.
  const seeking = seekingToFilters(me?.dating_prefs?.seeking);
  const usingSeeking = hasSeeking(seeking);
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
    genitalia,
    hanky,
  });

  const { data: likedIds = [] } = useMyIntimateLikes();
  const { data: passedIds = [] } = useMyIntimatePasses();
  const { data: matches = [], refetch: refetchMatches } = useIntimateMatches();
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

  const seekingHanky = me?.dating_prefs?.seeking?.hanky;
  // Hanky matches per card: what you look for (saved + filter) and what you wear.
  const hankyMatchById = useMemo(() => {
    const wanted = { ...seekingHanky, ...hanky };
    return new Map(
      visibleCards.map((c) => [c.user_id, hankyMatches(c.hanky, wanted, myHanky ?? {})]),
    );
  }, [visibleCards, seekingHanky, hanky, myHanky]);
  const rankedCards = visibleCards;

  useIncomingLikeListener(async () => {
    const { data: confirmed } = await refetchMatches();
    if (confirmed?.some((match) => !matchedSet.has(match.other_id))) {
      setMatchJoy(true);
      toast({ title: "It's a match", description: 'Open Messages to say hi.' });
    }
  });

  if (isLoading || loadingSettings) {
    return (
      <DiscoveryShell embedded={embedded}>
        <PageLoadingState count={4} label="Loading your discovery line" />
      </DiscoveryShell>
    );
  }

  if (settingsError)
    return (
      <DiscoveryShell embedded={embedded}>
        <p role="alert">Matching settings could not be loaded. Please reload to try again.</p>
      </DiscoveryShell>
    );
  if (!(matchingSettings?.user_id ? matchingSettings.dating_enabled : me?.opted_in_at)) {
    return (
      <DiscoveryShell embedded={embedded} form className="text-center">
        {!embedded && <h1 className="mb-4 text-2xl">Dating</h1>}
        <p className="mb-6 text-muted-foreground">
          Enable dating discovery and choose who you want to meet. An intimate profile is optional.
        </p>
        <Button onClick={() => navigate('/settings/dating')}>Set matching preferences</Button>
      </DiscoveryShell>
    );
  }

  return (
    <DiscoveryShell embedded={embedded} className="relative">
      {matchJoy && <JoyBurst onDone={() => setMatchJoy(false)} />}
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {embedded ? (
            <p className="text-sm font-semibold" aria-live="polite">
              {loadingDisc
                ? 'Finding people…'
                : `${rankedCards.length} ${rankedCards.length === 1 ? 'person' : 'people'}`}
            </p>
          ) : (
            <h1 className="text-2xl">Dating</h1>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {matches.length > 0 && (
              <Button variant="soft" size="sm" asChild>
                <LocalizedLink to="/messages?filter=matches">
                  {matches.length} match{matches.length === 1 ? '' : 'es'}
                </LocalizedLink>
              </Button>
            )}
            <div
              className="inline-flex gap-1 rounded-element bg-surface-container p-1"
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
                  className={cn(
                    'inline-flex min-h-9 items-center gap-2 rounded-badge px-4 text-13 font-semibold capitalize',
                    viewMode === m && 'bg-background',
                  )}
                >
                  {m === 'grid' ? (
                    <LayoutGrid size={14} aria-hidden />
                  ) : (
                    <Layers size={14} aria-hidden />
                  )}
                  {m}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" asChild>
              <LocalizedLink to="/settings/dating" className="gap-2">
                <Pencil size={14} aria-hidden />
                Edit profile
              </LocalizedLink>
            </Button>
            <LiveButton />
          </div>
        </div>
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
          hanky={hanky}
          onHankyChange={setHanky}
        />
        {usingSeeking && (
          <p className="flex flex-wrap items-center gap-x-2 text-13 text-muted-foreground">
            Filtered by who you're looking for.
            <button
              type="button"
              className="font-bold text-foreground underline underline-offset-4"
              onClick={() => {
                setRoles([]);
                setAges([]);
                setBodies([]);
                setGenitalia([]);
                setHanky({});
              }}
            >
              Show everyone
            </button>
            <LocalizedLink to="/settings/dating" className="underline underline-offset-4">
              Edit preferences
            </LocalizedLink>
          </p>
        )}
      </header>

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
        <div className="space-y-4">
          <p>No profiles currently meet all your requirements and discovery filters.</p>
          <p className="text-sm text-muted-foreground">
            Your requirements stay strict. Review a specific age range or distance limit if you
            choose to widen it. Saved seeking filters also remain requirements.
          </p>
          <Button variant="outline" asChild>
            <LocalizedLink to="/settings/dating">Review requirements</LocalizedLink>
          </Button>
        </div>
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
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {rankedCards.map((c) => (
            <DatingTile
              key={c.user_id}
              card={c}
              hankyMatch={(hankyMatchById.get(c.user_id)?.size ?? 0) > 0}
              liked={likedSet.has(c.user_id)}
              matched={matchedSet.has(c.user_id)}
              pending={likeMutation.isPending}
              onLike={() => likeMutation.mutate(c.user_id)}
              now={now}
            />
          ))}
        </ul>
      )}
    </DiscoveryShell>
  );
}

/** Active within the last half hour reads as "active now". */
const ACTIVE_MS = 30 * 60 * 1000;

function DatingTile({
  card,
  hankyMatch,
  liked,
  matched,
  pending,
  onLike,
  now,
}: {
  card: IntimateDiscoveryCard;
  hankyMatch: boolean;
  liked: boolean;
  matched: boolean;
  pending: boolean;
  onLike: () => void;
  now: number;
}) {
  const name = card.display_name ?? 'Member';
  const active = !!card.last_active_at && now - new Date(card.last_active_at).getTime() < ACTIVE_MS;
  const meta = [card.age_band, card.role?.join('/')].filter(Boolean).join(' · ');
  return (
    <li className="group relative">
      <Card className="flex h-full flex-col overflow-hidden p-0 transition-colors group-hover:bg-muted/40">
        <div className="relative aspect-square bg-surface-container">
          {card.avatar_url ? (
            <img
              src={card.avatar_url}
              alt=""
              loading="lazy"
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-headline font-bold text-muted-foreground"
              aria-hidden
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-2xs text-muted-foreground">Meets mutual requirements</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 p-2">
          <span className="flex min-w-0 items-center gap-1.5 text-13 font-bold">
            {active && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-foreground"
                title="Active now"
                aria-hidden
              />
            )}
            <span className="truncate">{name}</span>
          </span>
          {active && <span className="sr-only">Active now</span>}
          {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
          {hankyMatch && (
            <span className="text-2xs font-bold uppercase tracking-wide">Hanky match</span>
          )}
        </div>
      </Card>
      {/* Card-wide link: overlay sibling, never a wrapper (nested-interactive). */}
      <LocalizedLink
        to={`/user/${card.user_id}/dating`}
        aria-label={name}
        className="absolute inset-0 rounded-container no-underline focus-visible:ring-2 focus-visible:ring-ring"
      />
      {matched ? (
        <span className="absolute right-2 top-2 z-10 rounded-badge bg-foreground px-1.5 py-0.5 text-2xs font-bold uppercase text-background">
          Match
        </span>
      ) : (
        <Button
          type="button"
          size="icon"
          variant={liked ? 'default' : 'soft'}
          onClick={onLike}
          disabled={liked || pending}
          aria-pressed={liked}
          aria-label={liked ? `Liked ${name}` : `Like ${name}`}
          className="absolute right-2 top-2 z-10 h-9 w-9 rounded-full"
        >
          <Heart size={16} className={liked ? 'fill-current' : undefined} aria-hidden />
        </Button>
      )}
    </li>
  );
}

/** Live status for dating, with the shared live control in a popover. */
function LiveButton() {
  const { liveStatus } = useNearMe();
  const [now] = useState(Date.now);
  const live =
    liveStatus?.expiresAt && new Date(liveStatus.expiresAt).getTime() > now ? liveStatus : null;
  const until = live
    ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
        new Date(live.expiresAt!),
      )
    : null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant={live ? 'default' : 'outline'} className="gap-2">
          <MapPin size={14} aria-hidden />
          {live ? `Live until ${until}` : 'Go live'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <LivePresenceControl defaultAudience="dating" />
      </PopoverContent>
    </Popover>
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
