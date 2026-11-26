import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import {
  ArrowRight,
  Bookmark,
  Calendar as CalendarIcon,
  Luggage,
  MapPin,
  Newspaper,
  ShoppingBag,
  type LucideIcon,
} from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AgendaRow } from '@/components/hub/AgendaRow';
import { MissionsRow } from '@/components/profile/MissionsRow';
import { getTripPhase } from '@/components/trips/tripPhase';
import { useAuth } from '@/hooks/useAuth';
import { useMyAgenda } from '@/hooks/useMyAgenda';
import { useTrips } from '@/hooks/useTrips';
import { useUserRelationships } from '@/hooks/useUserRelationships';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { useMissions } from '@/hooks/useMissions';
import { fetchAllUserFavorites, fetchProfilesByUserIds } from '@/hooks/usePageFetchers';

/**
 * One short preview per Hub section, shown in the Hub menu's tabs: the
 * section's own latest items and a link to the full page. Each mounts only
 * while its tab is selected, so the menu fetches one section at a time.
 */

const LIMIT = 5;

type PeekProps = { onNavigate: () => void };

function PeekFrame({
  loading,
  empty,
  to,
  openLabel,
  onNavigate,
  children,
}: {
  loading: boolean;
  empty: string | null;
  to: string;
  openLabel: string;
  onNavigate: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="w-full">
      <div className="flex min-h-24 flex-col gap-0.5 px-1.5 py-2">
        {loading ? (
          <p className="px-4 py-6 text-center text-13 text-muted-foreground">
            {t('inbox.loading', { defaultValue: 'Loading…' })}
          </p>
        ) : empty ? (
          <p className="px-4 py-8 text-center text-13 text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </div>
      <div className="flex items-center rounded-b-container bg-surface-container px-2 py-1.5 text-xs font-bold">
        <LocalizedLink
          to={to}
          onClick={onNavigate}
          className="inline-flex min-h-9 items-center gap-1 rounded-badge px-2 no-underline transition-colors hover:bg-surface-container-high"
        >
          {openLabel}
          <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
      </div>
    </div>
  );
}

function PeekRow({
  to,
  icon: Icon,
  avatar,
  title,
  subtitle,
  onNavigate,
}: {
  to: string;
  icon?: LucideIcon;
  avatar?: { src: string | null; initial: string };
  title: string;
  subtitle?: string | null;
  onNavigate: () => void;
}) {
  return (
    <LocalizedLink
      to={to}
      onClick={onNavigate}
      className="flex min-h-11 items-center gap-2.5 rounded-element px-2.5 py-1.5 no-underline transition-colors hover:bg-surface-container-high"
    >
      {avatar ? (
        <Avatar className="h-8 w-8 shrink-0">
          {avatar.src && <AvatarImage src={avatar.src} alt="" />}
          <AvatarFallback className="text-xs">{avatar.initial}</AvatarFallback>
        </Avatar>
      ) : Icon ? (
        <Icon size={16} aria-hidden className="shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && (
          <span className="block truncate text-13 text-muted-foreground">{subtitle}</span>
        )}
      </span>
    </LocalizedLink>
  );
}

export function TodayPeek({ onNavigate, openLabel }: PeekProps & { openLabel: string }) {
  const { t } = useTranslation();
  // Same horizon as the Today page: the next 48h.
  const { from, to } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    return { from: start, to: end };
  }, []);
  const { days, loading } = useMyAgenda(from, to);
  const items = days.flatMap((d) => d.items).slice(0, LIMIT);
  return (
    <PeekFrame
      loading={loading}
      empty={
        items.length === 0
          ? t('hub.overview.nothingNeedsYou', { defaultValue: 'Nothing needs you right now.' })
          : null
      }
      to="/hub"
      openLabel={openLabel}
      onNavigate={onNavigate}
    >
      {/* AgendaRow carries its own link; closing the menu on click is done by
          the wrapper so the row stays shared with the calendar. */}
      <div onClickCapture={onNavigate} className="flex flex-col gap-0.5">
        {items.map((item) => (
          <AgendaRow key={item.id} item={item} />
        ))}
      </div>
    </PeekFrame>
  );
}

export function PlansPeek({ onNavigate, openLabel }: PeekProps & { openLabel: string }) {
  const { t } = useTranslation();
  const { data: trips, isLoading } = useTrips();
  const upcoming = (trips ?? [])
    .filter((trip) => ['live', 'countdown', 'plan'].includes(getTripPhase(trip)))
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
    .slice(0, LIMIT);
  const dates = (start: string | null, end: string | null) =>
    start
      ? end
        ? `${format(parseISO(start), 'MMM d')} – ${format(parseISO(end), 'MMM d, yyyy')}`
        : format(parseISO(start), 'MMM d, yyyy')
      : null;
  return (
    <PeekFrame
      loading={isLoading}
      empty={
        upcoming.length === 0
          ? t('hub.menu.tripsEmpty', { defaultValue: 'No upcoming trips.' })
          : null
      }
      to="/hub/plans"
      openLabel={openLabel}
      onNavigate={onNavigate}
    >
      {upcoming.map((trip) => (
        <PeekRow
          key={trip.id}
          to={`/trips/${trip.id}`}
          icon={Luggage}
          title={trip.title}
          subtitle={dates(trip.start_date, trip.end_date)}
          onNavigate={onNavigate}
        />
      ))}
    </PeekFrame>
  );
}

type SavedRow = { key: string; to: string; icon: LucideIcon; title: string; subtitle?: string };

export function SavedPeek({ onNavigate, openLabel }: PeekProps & { openLabel: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['hub-menu', 'saved', user?.id],
    enabled: !!user,
    queryFn: () => fetchAllUserFavorites(user!.id),
  });
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const rows: SavedRow[] = data
    ? [
        ...data.venues.map((v) => ({
          key: `v-${str(v.id)}`,
          to: `/venues/${str(v.slug) || str(v.id)}`,
          icon: MapPin,
          title: str(v.name),
          subtitle: str(v.category),
        })),
        ...data.events.map((e) => ({
          key: `e-${str(e.id)}`,
          to: `/events/${str(e.slug) || str(e.id)}`,
          icon: CalendarIcon,
          title: str(e.title),
          subtitle: str(e.city),
        })),
        ...data.marketplace.map((m) => ({
          key: `m-${str(m.id)}`,
          to: `/marketplace/${str(m.slug) || str(m.id)}`,
          icon: ShoppingBag,
          title: str(m.title),
          subtitle: str(m.business_name),
        })),
        ...data.news.map((n) => ({
          key: `n-${str(n.id)}`,
          to: `/news/${str(n.slug) || str(n.id)}`,
          icon: Newspaper,
          title: str(n.title),
        })),
      ].slice(0, LIMIT)
    : [];
  return (
    <PeekFrame
      loading={isLoading}
      empty={
        rows.length === 0 ? t('hub.menu.savedEmpty', { defaultValue: 'Nothing saved yet.' }) : null
      }
      to="/hub/saved"
      openLabel={openLabel}
      onNavigate={onNavigate}
    >
      {rows.map((r) => (
        <PeekRow
          key={r.key}
          to={r.to}
          icon={r.icon ?? Bookmark}
          title={r.title}
          subtitle={r.subtitle}
          onNavigate={onNavigate}
        />
      ))}
    </PeekFrame>
  );
}

type FriendProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location: string | null;
};

export function FriendsPeek({ onNavigate, openLabel }: PeekProps & { openLabel: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { getFriends, loading } = useUserRelationships();
  const ids = getFriends()
    .map((r) => (r.user_id === user?.id ? r.target_user_id : r.user_id))
    .slice(0, LIMIT);
  const { data: profiles, isLoading } = useQuery({
    queryKey: ['hub-menu', 'friends', ids],
    enabled: ids.length > 0,
    queryFn: () => fetchProfilesByUserIds<FriendProfile>(ids),
  });
  return (
    <PeekFrame
      loading={(loading && ids.length === 0) || (ids.length > 0 && isLoading)}
      empty={
        ids.length === 0 ? t('hub.overview.noFriends', { defaultValue: 'No friends yet.' }) : null
      }
      to="/hub/friends"
      openLabel={openLabel}
      onNavigate={onNavigate}
    >
      {(profiles ?? []).map((p) => (
        <PeekRow
          key={p.user_id}
          to={`/user/${p.user_id}`}
          avatar={{
            src: p.avatar_url,
            initial: (p.display_name || '?').charAt(0).toUpperCase(),
          }}
          title={p.display_name || t('people.card.member', 'Member')}
          subtitle={p.location}
          onNavigate={onNavigate}
        />
      ))}
    </PeekFrame>
  );
}

export function FeedPeek({ onNavigate, openLabel }: PeekProps & { openLabel: string }) {
  const { t } = useTranslation();
  const { posts, isLoading } = useCommunityPosts();
  const rows = (posts ?? []).slice(0, LIMIT);
  return (
    <PeekFrame
      loading={isLoading}
      empty={rows.length === 0 ? t('hub.menu.feedEmpty', { defaultValue: 'No posts yet.' }) : null}
      to="/hub/feed"
      openLabel={openLabel}
      onNavigate={onNavigate}
    >
      {rows.map((post) => (
        <PeekRow
          key={post.id}
          to={`/posts/${post.id}`}
          avatar={{
            src: post.profiles?.avatar_url ?? null,
            initial: (post.profiles?.display_name || '?').charAt(0).toUpperCase(),
          }}
          title={post.content}
          subtitle={post.profiles?.display_name}
          onNavigate={onNavigate}
        />
      ))}
    </PeekFrame>
  );
}

export function ProgressPeek({ onNavigate, openLabel }: PeekProps & { openLabel: string }) {
  const { t } = useTranslation();
  const { data: missions = [], isLoading } = useMissions();
  const open = missions.filter((m) => !m.completed);
  return (
    <PeekFrame
      loading={isLoading}
      empty={
        open.length === 0
          ? t('hub.menu.progressEmpty', { defaultValue: 'No open missions.' })
          : null
      }
      to="/hub/progress"
      openLabel={openLabel}
      onNavigate={onNavigate}
    >
      <div className="px-2.5">
        <MissionsRow hideCompleted limit={LIMIT} />
      </div>
    </PeekFrame>
  );
}
