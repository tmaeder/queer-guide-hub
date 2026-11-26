import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import {
  ArrowRight,
  Award,
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
import { getTripPhase } from '@/components/trips/tripPhase';
import { useAuth } from '@/hooks/useAuth';
import { useTrips } from '@/hooks/useTrips';
import { useUserRelationships } from '@/hooks/useUserRelationships';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import {
  buildPostValidationPayload,
  extractMentionsAndTags,
  preSubmitCheck,
} from '@/components/posts/postValidation';
import { useFormValidation } from '@/components/security/EnhancedFormValidator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useMissions } from '@/hooks/useMissions';
import { fetchAllUserFavorites, fetchProfilesByUserIds } from '@/hooks/usePageFetchers';

/**
 * One short preview per Hub section, shown in the Hub menu's tabs: the
 * section's own latest items and a link to the full page. Each mounts only
 * while its tab is selected, so the menu fetches one section at a time.
 */

const LIMIT = 4;

type PeekProps = { onNavigate: () => void };

function PeekFrame({
  loading,
  empty,
  to,
  openLabel,
  onNavigate,
  top,
  children,
}: {
  top?: ReactNode;
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
        {top}
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

/**
 * A text post written right in the menu. Same checks as the Feed page's
 * composer (empty check, content validation, @mentions and #tags); photos,
 * links, polls and content labels stay on the Feed page.
 */
function FeedComposer({
  createPost,
  posting,
}: {
  createPost: ReturnType<typeof useCommunityPosts>['createPost'];
  posting: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { validateFormData } = useFormValidation();
  const [content, setContent] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const preErr = preSubmitCheck('text', { content });
    if (preErr) {
      toast({ title: 'Error', description: preErr.message, variant: 'destructive' });
      return;
    }
    const { data, fields } = buildPostValidationPayload('text', { content });
    const validation = await validateFormData(data, fields);
    if (!validation.isValid) {
      toast({
        title: 'Content Validation Failed',
        description: validation.errors.join(', '),
        variant: 'destructive',
      });
      return;
    }
    createPost(
      {
        content: content.trim(),
        post_type: 'text',
        visibility: 'public',
        ...extractMentionsAndTags(content),
      },
      { onSuccess: () => setContent('') },
    );
  };

  return (
    <form onSubmit={submit} className="mb-1 flex items-end gap-2 rounded-element bg-card p-1.5">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter posts; plain Enter makes a new line.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        rows={2}
        maxLength={5000}
        aria-label={t(
          'pages.feed.createPostPlaceholder',
          "What's on your mind? Share with the community...",
        )}
        placeholder={t(
          'pages.feed.createPostPlaceholder',
          "What's on your mind? Share with the community...",
        )}
        className="max-h-24 min-h-14 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-13 shadow-none focus-visible:ring-0"
      />
      <Button type="submit" size="sm" loading={posting} disabled={!content.trim()}>
        {t('hub.menu.post', 'Post')}
      </Button>
    </form>
  );
}

export function FeedPeek({ onNavigate, openLabel }: PeekProps & { openLabel: string }) {
  const { t } = useTranslation();
  const { posts, isLoading, createPost, isCreatingPost } = useCommunityPosts();
  // One row fewer than the other tabs: the composer takes its place, so the
  // menu still fits without scrolling.
  const rows = (posts ?? []).slice(0, LIMIT - 1);
  return (
    <PeekFrame
      loading={isLoading}
      empty={rows.length === 0 ? t('hub.menu.feedEmpty', { defaultValue: 'No posts yet.' }) : null}
      to="/hub/feed"
      openLabel={openLabel}
      onNavigate={onNavigate}
      top={<FeedComposer createPost={createPost} posting={isCreatingPost} />}
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

/** The Alerts tab's progress line: your next open mission, linked to Progress. */
export function NextMissionRow({ onNavigate }: PeekProps) {
  const { t } = useTranslation();
  const { data: missions = [] } = useMissions();
  const next = missions.find((m) => !m.completed);
  if (!next) return null;
  const pct = next.target > 0 ? Math.min(1, next.progress / next.target) : 0;
  return (
    <div className="px-1.5 pb-2">
      <LocalizedLink
        to="/hub/progress"
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-2.5 rounded-element bg-card px-2.5 py-2 no-underline transition-colors hover:bg-surface-container-high"
      >
        <Award size={16} aria-hidden className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-13 font-bold">
              {t('hub.menu.nextMission', 'Next mission')}: {next.title}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {next.progress}/{next.target}
            </span>
          </span>
          <span
            className="mt-1 block h-1 overflow-hidden rounded-badge bg-foreground/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct * 100)}
          >
            <span className="block h-full bg-foreground" style={{ width: `${pct * 100}%` }} />
          </span>
        </span>
      </LocalizedLink>
    </div>
  );
}
