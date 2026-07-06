import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bookmark,
  CalendarClock,
  Check,
  Heart,
  Loader2,
  MessageCircle,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { AgendaRow } from '@/components/hub/AgendaRow';
import { useAuth } from '@/hooks/useAuth';
import { useMyAgenda } from '@/hooks/useMyAgenda';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { useUserRelationships } from '@/hooks/useUserRelationships';
import { fetchAllUserFavorites, fetchProfilesByUserIds } from '@/hooks/usePageFetchers';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { useIntimateMatches } from '@/hooks/useIntimateMatches';

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location: string | null;
}

/** Section wrapper: heading + "see all" link into the owning module. */
function OverviewSection({
  icon: Icon,
  title,
  to,
  seeAllLabel,
  children,
}: {
  icon: LucideIcon;
  title: string;
  to: string;
  seeAllLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-title font-display">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          {title}
        </h2>
        <LocalizedLink
          to={to}
          className="flex items-center gap-1 text-13 text-muted-foreground no-underline hover:text-foreground"
        >
          {seeAllLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </LocalizedLink>
      </div>
      {children}
    </section>
  );
}

/**
 * Hub Overview — the personal office's front door (2026-07). An at-a-glance
 * peek at each surface: the next few upcoming commitments grouped by day
 * (→ Plans), pending friend requests + friends (→ Messages/People), recent
 * conversations (→ Messages) and how much is saved (→ Saved). Read-only
 * aggregation over existing hooks; every block drills into its module.
 */
export function OverviewModule() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Dating peek is self-gated: only opted-in users see it (privacy parity with
  // DatingSection). Matches are conversations, so it deep-links into Messages.
  const { data: intimateProfile } = useMyIntimateProfile();
  const { data: matches } = useIntimateMatches();
  const matchCount = matches?.length ?? 0;

  // Next 14 days of agenda, kept grouped by day so the peek reads as a calendar.
  const { from, to } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    return { from: start, to: end };
  }, []);
  const { days, loading: agendaLoading } = useMyAgenda(from, to);
  // First ~5 commitments, but keep their day grouping (Today / Tomorrow / date).
  const previewDays = useMemo(() => {
    const out: { date: string; items: (typeof days)[number]['items'] }[] = [];
    let budget = 5;
    for (const day of days) {
      if (budget <= 0) break;
      const items = day.items.slice(0, budget);
      budget -= items.length;
      if (items.length > 0) out.push({ date: day.date, items });
    }
    return out;
  }, [days]);

  const dayLabel = (key: string) => {
    const d = new Date(`${key}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return t('hub.calendar.today', { defaultValue: 'Today' });
    if (diff === 1) return t('hub.calendar.tomorrow', { defaultValue: 'Tomorrow' });
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // People: pending friend requests (actionable inline) + a friends preview.
  const {
    getPendingRequests,
    getFriends,
    acceptFriendRequest,
    rejectFriendRequest,
    loading: relLoading,
  } = useUserRelationships();
  const requests = getPendingRequests();
  const friends = getFriends();
  const requesterIds = requests.map((r) => r.user_id);
  const friendIds = user
    ? friends.map((f) => (f.user_id === user.id ? f.target_user_id : f.user_id))
    : [];
  const { data: peopleProfiles } = useQuery({
    queryKey: ['hub-overview', 'people', requesterIds, friendIds],
    enabled: !!user && requesterIds.length + friendIds.length > 0,
    queryFn: () => fetchProfilesByUserIds<ProfileRow>([...requesterIds, ...friendIds]),
  });
  const profileOf = (id: string) => peopleProfiles?.find((p) => p.user_id === id);
  const friendPreview = friendIds.slice(0, 6);

  const { items, unreadCount, loading: inboxLoading } = useInboxFeed('all');
  const recentChats = useMemo(
    () => items.filter((i) => i.kind === 'chat').slice(0, 4),
    [items],
  );

  const { data: savedCount, isLoading: savedLoading } = useQuery({
    queryKey: ['hub-overview', 'saved-count', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const favs = await fetchAllUserFavorites(user!.id);
      return (
        (favs.venues?.length ?? 0) +
        (favs.events?.length ?? 0) +
        (favs.marketplace?.length ?? 0) +
        (favs.news?.length ?? 0)
      );
    },
  });

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-headline font-display">
        {t('hub.overview.title', { defaultValue: 'Overview' })}
      </h1>

      {/* Upcoming plans — grouped by day so it reads as a calendar. */}
      <OverviewSection
        icon={CalendarClock}
        title={t('hub.calendar.title', { defaultValue: 'Upcoming' })}
        to="/hub/plans"
        seeAllLabel={t('hub.overview.seePlans', { defaultValue: 'All plans' })}
      >
        {agendaLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        ) : previewDays.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('hub.calendar.empty', { defaultValue: 'Nothing upcoming yet.' })}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {previewDays.map((day) => (
              <div key={day.date} className="flex flex-col gap-2">
                <h3 className="text-13 font-semibold uppercase tracking-wider text-muted-foreground">
                  {dayLabel(day.date)}
                </h3>
                {day.items.map((item) => (
                  <AgendaRow key={item.id} item={item} />
                ))}
              </div>
            ))}
          </div>
        )}
      </OverviewSection>

      {/* People — pending friend requests + friends preview. */}
      <OverviewSection
        icon={Users}
        title={t('hub.overview.people', { defaultValue: 'People' })}
        to="/hub/messages?tab=people"
        seeAllLabel={
          friends.length > 0
            ? t('hub.overview.friendCount', {
                defaultValue: '{{count}} friends',
                count: friends.length,
              })
            : t('hub.overview.findPeople', { defaultValue: 'Find people' })
        }
      >
        {relLoading && !peopleProfiles ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        ) : requests.length === 0 && friendIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('hub.overview.noFriends', { defaultValue: 'No friends yet.' })}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {requests.length > 0 && (
              <div className="flex flex-col gap-2">
                {requests.map((req) => {
                  const profile = profileOf(req.user_id);
                  const name = profile?.display_name || t('common.unknownUser', 'Someone');
                  return (
                    <div
                      key={req.id}
                      className="flex items-center gap-2 rounded-element border border-border px-4 py-2"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile?.avatar_url || undefined} alt="" />
                        <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {t('hub.overview.wantsToConnect', { defaultValue: 'Wants to connect' })}
                        </p>
                      </div>
                      <Button
                        variant="default"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t('common.accept', 'Accept')}
                        disabled={relLoading}
                        onClick={() => acceptFriendRequest(req.id)}
                      >
                        <Check className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t('common.decline', 'Decline')}
                        disabled={relLoading}
                        onClick={() => rejectFriendRequest(req.id)}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {friendPreview.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {friendPreview.map((id) => {
                    const profile = profileOf(id);
                    const name = profile?.display_name || 'U';
                    return (
                      <LocalizedLink key={id} to={`/users/${id}`} className="no-underline">
                        <Avatar className="h-8 w-8 border-2 border-background">
                          <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
                          <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </LocalizedLink>
                    );
                  })}
                </div>
                {friends.length > friendPreview.length && (
                  <span className="text-13 text-muted-foreground">
                    +{friends.length - friendPreview.length}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </OverviewSection>

      {/* Recent messages */}
      <OverviewSection
        icon={MessageCircle}
        title={t('hub.modules.messages', { defaultValue: 'Messages' })}
        to="/hub/messages"
        seeAllLabel={
          unreadCount > 0
            ? t('hub.overview.unread', {
                defaultValue: '{{count}} unread',
                count: unreadCount,
              })
            : t('hub.overview.openMessages', { defaultValue: 'Open inbox' })
        }
      >
        {inboxLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        ) : recentChats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('hub.overview.noChats', { defaultValue: 'No conversations yet.' })}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentChats.map((chat) => (
              <LocalizedLink
                key={chat.id}
                to={`/hub/messages?conversation=${chat.id.replace('conv_', '')}`}
                className="flex items-center gap-2 rounded-element border border-border px-4 py-2 no-underline transition-colors hover:bg-muted"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={chat.avatar_url ?? undefined} alt="" />
                  <AvatarFallback>
                    <MessageCircle className="h-4 w-4" aria-hidden />
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm font-medium">{chat.title}</span>
              </LocalizedLink>
            ))}
          </div>
        )}
      </OverviewSection>

      {/* Dating matches — opted-in only */}
      {intimateProfile && (
        <OverviewSection
          icon={Heart}
          title={t('hub.contacts.dating', { defaultValue: 'Dating' })}
          to="/hub/messages?filter=matches"
          seeAllLabel={t('hub.overview.openMatches', { defaultValue: 'Open matches' })}
        >
          <p className="text-sm text-muted-foreground">
            {matchCount > 0
              ? t('hub.overview.matchCount', { defaultValue: '{{count}} matches', count: matchCount })
              : t('hub.overview.noMatches', { defaultValue: 'No matches yet.' })}
          </p>
        </OverviewSection>
      )}

      {/* Saved */}
      <OverviewSection
        icon={Bookmark}
        title={t('hub.modules.saved', { defaultValue: 'Saved' })}
        to="/hub/saved"
        seeAllLabel={t('hub.overview.openSaved', { defaultValue: 'Open saved' })}
      >
        {savedLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <p className="text-sm text-muted-foreground">
            {savedCount && savedCount > 0
              ? t('hub.overview.savedCount', {
                  defaultValue: '{{count}} saved',
                  count: savedCount,
                })
              : t('hub.overview.noSaved', { defaultValue: 'Nothing saved yet.' })}
          </p>
        )}
      </OverviewSection>
    </div>
  );
}
