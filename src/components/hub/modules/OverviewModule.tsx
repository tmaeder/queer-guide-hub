import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCheck,
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
import { fetchProfilesByUserIds } from '@/hooks/usePageFetchers';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { useIntimateMatches } from '@/hooks/useIntimateMatches';

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location: string | null;
}

/** Section wrapper: heading + "see all" link into the owning surface. */
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
 * Hub Overview — actionable-only landing (2026-07 declutter). Renders a
 * section ONLY when something needs the user: pending friend requests
 * (inline accept/decline), unread messages, the next 48h of commitments and
 * unseen dating matches. Passive peeks (friends stack, recent-chats list,
 * saved count) are gone — each surface is single-homed in its own module.
 * When nothing needs attention, one "All caught up" empty state.
 */
export function OverviewModule() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Dating peek is self-gated: only opted-in users see it (privacy parity
  // with /people/dating). Matches are conversations → deep-link to Messages.
  const { data: intimateProfile } = useMyIntimateProfile();
  const { data: matches } = useIntimateMatches();
  const matchCount = matches?.length ?? 0;

  // Next 48h of agenda — imminent commitments only; the full horizon is Plans.
  const { from, to } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    return { from: start, to: end };
  }, []);
  const { days, loading: agendaLoading } = useMyAgenda(from, to);

  const dayLabel = (key: string) => {
    const d = new Date(`${key}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return t('hub.calendar.today', { defaultValue: 'Today' });
    if (diff === 1) return t('hub.calendar.tomorrow', { defaultValue: 'Tomorrow' });
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // People: pending friend requests, actionable inline.
  const {
    getPendingRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    loading: relLoading,
  } = useUserRelationships();
  const requests = getPendingRequests();
  const requesterIds = requests.map((r) => r.user_id);
  const { data: requesterProfiles } = useQuery({
    queryKey: ['hub-overview', 'requesters', requesterIds],
    enabled: !!user && requesterIds.length > 0,
    queryFn: () => fetchProfilesByUserIds<ProfileRow>(requesterIds),
  });
  const profileOf = (id: string) => requesterProfiles?.find((p) => p.user_id === id);

  const { unreadCount, loading: inboxLoading } = useInboxFeed('all');

  const loading = agendaLoading || inboxLoading || (relLoading && requests.length === 0);
  const hasAgenda = days.some((d) => d.items.length > 0);
  const hasAnything =
    hasAgenda || requests.length > 0 || unreadCount > 0 || (!!intimateProfile && matchCount > 0);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-headline font-display">
        {t('hub.overview.title', { defaultValue: 'Overview' })}
      </h1>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      ) : !hasAnything ? (
        <div className="flex flex-col items-start gap-2 py-8">
          <CheckCheck className="h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {t('hub.overview.allCaughtUp', { defaultValue: 'All caught up.' })}
          </p>
        </div>
      ) : (
        <>
          {/* Next 48h — imminent commitments, grouped by day. */}
          {hasAgenda && (
            <OverviewSection
              icon={CalendarClock}
              title={t('hub.overview.next48h', { defaultValue: 'Next two days' })}
              to="/hub/plans"
              seeAllLabel={t('hub.overview.seePlans', { defaultValue: 'All plans' })}
            >
              <div className="flex flex-col gap-4">
                {days
                  .filter((day) => day.items.length > 0)
                  .map((day) => (
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
            </OverviewSection>
          )}

          {/* Pending friend requests — actionable inline. */}
          {requests.length > 0 && (
            <OverviewSection
              icon={Users}
              title={t('hub.overview.requests', { defaultValue: 'Friend requests' })}
              to="/people/friends"
              seeAllLabel={t('hub.overview.allPeople', { defaultValue: 'All people' })}
            >
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
            </OverviewSection>
          )}

          {/* Unread messages — one compact row into the inbox. */}
          {unreadCount > 0 && (
            <OverviewSection
              icon={MessageCircle}
              title={t('hub.modules.messages', { defaultValue: 'Messages' })}
              to="/hub/messages"
              seeAllLabel={t('hub.overview.openMessages', { defaultValue: 'Open inbox' })}
            >
              <p className="text-sm text-muted-foreground">
                {t('hub.overview.unread', {
                  defaultValue: '{{count}} unread',
                  count: unreadCount,
                })}
              </p>
            </OverviewSection>
          )}

          {/* Dating matches — opted-in only, only when there are matches. */}
          {intimateProfile && matchCount > 0 && (
            <OverviewSection
              icon={Heart}
              title={t('hub.contacts.dating', { defaultValue: 'Dating' })}
              to="/hub/messages?filter=matches"
              seeAllLabel={t('hub.overview.openMatches', { defaultValue: 'Open matches' })}
            >
              <p className="text-sm text-muted-foreground">
                {t('hub.overview.matchCount', {
                  defaultValue: '{{count}} matches',
                  count: matchCount,
                })}
              </p>
            </OverviewSection>
          )}
        </>
      )}
    </div>
  );
}
