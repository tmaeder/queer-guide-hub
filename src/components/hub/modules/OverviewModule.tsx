import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bookmark, CalendarClock, Loader2, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AgendaRow } from '@/components/hub/AgendaRow';
import { useAuth } from '@/hooks/useAuth';
import { useMyAgenda } from '@/hooks/useMyAgenda';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { fetchAllUserFavorites } from '@/hooks/usePageFetchers';

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
 * peek at each surface: the next few upcoming commitments (→ Plans), recent
 * conversations + unread count (→ Messages), and how much is saved (→ Saved).
 * Read-only aggregation over existing hooks; every block drills into its
 * dedicated module.
 */
export function OverviewModule() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Next 14 days of agenda, flattened to the first few items.
  const { from, to } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    return { from: start, to: end };
  }, []);
  const { days, loading: agendaLoading } = useMyAgenda(from, to);
  const nextItems = useMemo(
    () => days.flatMap((d) => d.items).slice(0, 4),
    [days],
  );

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

      {/* Upcoming plans */}
      <OverviewSection
        icon={CalendarClock}
        title={t('hub.calendar.title', { defaultValue: 'Upcoming' })}
        to="/hub/plans"
        seeAllLabel={t('hub.overview.seePlans', { defaultValue: 'All plans' })}
      >
        {agendaLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        ) : nextItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('hub.calendar.empty', { defaultValue: 'Nothing upcoming yet.' })}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {nextItems.map((item) => (
              <AgendaRow key={item.id} item={item} />
            ))}
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
