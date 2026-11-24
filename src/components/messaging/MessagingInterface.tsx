import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, ChevronLeft, Search, X } from '@/components/icons';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams } from 'react-router';
import { VibeEditor } from '@/components/messaging/VibeEditor';
import { useInboxFeed, type InboxFilter } from '@/hooks/useInboxFeed';
import { InboxRailItem } from '@/components/messaging/InboxRailItem';
import { useGlobalPresence } from '@/hooks/useConversationPresence';
import { useRailActions } from '@/hooks/useRailActions';
import { MailDetail } from '@/components/messaging/MailDetail';
import { TripEmailThread } from '@/components/messaging/TripEmailThread';
import { NotificationDetailCard } from '@/components/messaging/NotificationDetailCard';
import { ComposeChooser } from '@/components/messaging/ComposeChooser';
import { RecipientPicker } from '@/components/messaging/RecipientPicker';
import { ComposeEmail } from '@/components/inbox/ComposeEmail';
import { ChatView } from '@/components/messaging/chat/ChatView';
import { useInboxSearch } from '@/components/messaging/chat/useInboxSearch';
import { useInboxSelection } from '@/components/messaging/chat/useInboxSelection';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from '@/components/ui/button';
import { mailboxSelection } from '@/lib/mailboxSelection';

export interface MessagingInterfaceProps {
  /**
   * Active inbox filter for the merged rail (chats + mail + notifications).
   * Defaults to 'all'.
   */
  filter?: InboxFilter;
  /** Extra classes for the root split container (e.g. a taller hub workspace height). */
  className?: string;
  search?: string;
  onSearchChange?: (value: string) => void;
}

export const MessagingInterface = ({
  filter,
  className,
  search: controlledSearch,
  onSearchChange,
}: MessagingInterfaceProps = {}) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { items, loading, hasNextPage, fetchNextPage, isFetchingNextPage, error, refetch } =
    useInboxFeed(filter ?? 'all');
  const onlineUsers = useGlobalPresence();
  const railActions = useRailActions();
  // A new message or email is written in the reading pane, not in a sheet.
  // `?compose=message|email` (the header popover's "New message") opens the
  // composer on arrival.
  const [composing, setComposing] = useState<'message' | 'email' | null>(() => {
    const c = searchParams.get('compose');
    return c === 'message' || c === 'email' ? c : null;
  });
  // Consume ?compose= so a refresh does not reopen the composer.
  useEffect(() => {
    if (!searchParams.has('compose')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('compose');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const { user } = useAuth();

  const { search, setSearch, visibleItems, searching, searchFailed } = useInboxSearch(
    items,
    user,
    filter === 'mail',
    controlledSearch,
    onSearchChange,
  );
  const {
    selected,
    handleSelect: selectItem,
    handleBack: clearSelection,
  } = useInboxSelection(filter, items, searchParams, setSearchParams);
  const handleSelect: typeof selectItem = (item) => {
    setComposing(null);
    selectItem(item);
    if (item.kind === 'chat' && item.unread)
      void railActions.markRead(item.id.replace('conv_', ''));
  };
  const handleBack = () => {
    setComposing(null);
    clearSelection();
  };
  const compose = (kind: 'message' | 'email') => {
    clearSelection();
    setComposing(kind);
  };
  const showPane = Boolean(selected || composing);
  const unreadOnly = searchParams.get('unread') === '1';
  const filteredItems = visibleItems
    .filter((item) => {
      const inCategory =
        !filter ||
        filter === 'all' ||
        (filter === 'chats' && item.kind === 'chat') ||
        (filter === 'matches' && item.kind === 'chat' && item.subtype === 'match') ||
        (filter === 'groups' && item.kind === 'chat' && item.subtype === 'group') ||
        (filter === 'mail' && item.kind === 'mail') ||
        (filter === 'alerts' && item.kind === 'notification') ||
        (filter === 'trips' && (item.kind === 'trip_email' || item.subtype === 'trip_nudge'));
      return inCategory && (!unreadOnly || item.unread);
    })
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.ts.localeCompare(a.ts));
  const workspaceRef = useRef<HTMLDivElement>(null);
  const detailOpen = showPane;
  useEffect(() => {
    if (!detailOpen) return;
    const viewport = window.visualViewport;
    const update = () => {
      workspaceRef.current?.style.setProperty(
        '--inbox-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      workspaceRef.current?.style.setProperty(
        '--inbox-viewport-top',
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    const media = window.matchMedia('(max-width: 767px)');
    const previous = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = new Map<HTMLElement, boolean>();
    const restoreBackground = () => {
      background.forEach((wasInert, element) => {
        if (!wasInert) element.removeAttribute('inert');
      });
      background.clear();
    };
    const lock = () => {
      document.body.style.overflow = media.matches ? 'hidden' : previous;
      if (!media.matches) {
        restoreBackground();
        return;
      }
      if (background.size) return;
      // Keep global navigation and module controls out of the focused mobile
      // reading surface, preserving any pre-existing inert boundaries.
      let current: HTMLElement | null = workspaceRef.current;
      while (current?.parentElement) {
        for (const sibling of current.parentElement.children) {
          if (sibling instanceof HTMLElement && sibling !== current) {
            background.set(sibling, sibling.hasAttribute('inert'));
            sibling.setAttribute('inert', '');
          }
        }
        current = current.parentElement;
        if (current === document.body) break;
      }
      workspaceRef.current
        ?.querySelector<HTMLElement>('[data-inbox-detail] button')
        ?.focus({ preventScroll: true });
    };
    update();
    lock();
    media.addEventListener('change', lock);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      document.body.style.overflow = previous;
      restoreBackground();
      if (media.matches && previouslyFocused?.isConnected)
        previouslyFocused.focus({ preventScroll: true });
      media.removeEventListener('change', lock);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [detailOpen]);

  return (
    <div
      ref={workspaceRef}
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-container bg-card shadow-soft md:flex-row',
        className,
        showPane &&
          'max-md:fixed max-md:inset-x-0 max-md:top-[var(--inbox-viewport-top,0px)] max-md:z-50 max-md:h-[var(--inbox-viewport-height,100dvh)] max-md:min-h-0',
      )}
    >
      {/* Merged inbox rail - full width on mobile, 1/3 on desktop */}
      {/* The list sits on the card's white, the reading pane on a light wash:
          the tonal step separates them, so no hairline is needed. */}
      <div
        className={`${showPane ? 'hidden md:flex' : 'flex'} min-h-0 w-full flex-col md:w-[38%] md:max-w-md md:shrink-0`}
      >
        {/* Rail header */}
        <div>
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <VibeEditor />
            <ComposeChooser
              onNewMessage={() => compose('message')}
              onNewEmail={() => compose('email')}
            />
          </div>
          <div className="px-4 pb-4">
            {filter === 'mail' && (
              <p className="mb-2 text-sm text-muted-foreground">{t('inbox.mail.scope')}</p>
            )}
            <div className="relative">
              <Search
                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('inbox.search', { defaultValue: 'Search' })}
                aria-label={t('inbox.search', { defaultValue: 'Search' })}
                className="h-11 rounded-element pl-10"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <Button
            type="button"
            variant={unreadOnly ? 'default' : 'ghost'}
            size="sm"
            className="min-h-11"
            aria-pressed={unreadOnly}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              if (unreadOnly) next.delete('unread');
              else next.set('unread', '1');
              setSearchParams(next, { replace: true });
            }}
          >
            {t('inbox.unread', { defaultValue: 'Unread' })}
          </Button>
          <span className="text-2xs text-muted-foreground" role="status">
            {t('inbox.visibleCount', {
              defaultValue: '{{count}} shown',
              count: filteredItems.length,
            })}
          </span>
        </div>
        {searchFailed && (
          <p role="alert" className="px-4 py-2 text-sm text-destructive">
            {t('inbox.searchFailed', {
              defaultValue: 'Search is unavailable. Showing matches from loaded items.',
            })}
          </p>
        )}
        <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
          {loading || (searching && filteredItems.length === 0) ? (
            <div className="flex items-center justify-center py-16">
              <TrackLoader
                size={32}
                label={t('inbox.loading', { defaultValue: 'Loading messages' })}
              />
            </div>
          ) : error && items.length === 0 ? (
            <div className="space-y-4 px-4 py-8 text-center" role="alert">
              <p>{t('inbox.loadError', { defaultValue: 'Messages could not be loaded.' })}</p>
              <Button variant="outline" onClick={() => void refetch()}>
                {t('common.retry', { defaultValue: 'Try again' })}
              </Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle
                size={48}
                style={{ margin: '0 auto 16px' }}
                className="text-muted-foreground"
              />
              <p className="text-muted-foreground">
                {search.trim()
                  ? t('inbox.searchEmpty', { defaultValue: 'No matches.' })
                  : unreadOnly
                    ? hasNextPage
                      ? t('inbox.noUnreadLoaded', {
                          defaultValue: 'No unread items in the messages loaded so far.',
                        })
                      : t('inbox.caughtUp', { defaultValue: 'You’re all caught up.' })
                    : t('inbox.emptyCategory', { defaultValue: 'No items in this category yet.' })}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  if (search.trim()) setSearch('');
                  else if (unreadOnly) {
                    const next = new URLSearchParams(searchParams);
                    next.delete('unread');
                    setSearchParams(next, { replace: true });
                  } else if (filter === 'mail') compose('email');
                  else compose('message');
                }}
              >
                {search.trim()
                  ? t('inbox.clearSearch', { defaultValue: 'Clear search' })
                  : unreadOnly
                    ? t('inbox.showAll', { defaultValue: 'Show all items' })
                    : filter === 'mail'
                      ? t('inbox.compose.email', { defaultValue: 'New email' })
                      : t('inbox.compose.message', { defaultValue: 'New message' })}
              </Button>
            </div>
          ) : (
            <div>
              {filteredItems.map((item) => (
                <InboxRailItem
                  key={item.id}
                  item={item}
                  active={selected?.id === item.id}
                  onSelect={handleSelect}
                  online={item.other_user_id ? onlineUsers.has(item.other_user_id) : false}
                  actions={railActions}
                />
              ))}
            </div>
          )}
          {error && items.length > 0 && (
            <p role="alert" className="px-4 text-sm text-destructive">
              {t('inbox.olderError', {
                defaultValue: 'Older items could not be loaded. Try again below.',
              })}
            </p>
          )}
          {hasNextPage && !loading && (
            <div className="p-4 text-center">
              <Button
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage
                  ? t('common.loading', { defaultValue: 'Loading…' })
                  : t('inbox.loadMore', { defaultValue: 'Load older items' })}
              </Button>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right pane - per-kind detail */}
      <div
        data-inbox-detail
        className={`min-h-0 min-w-0 flex-1 flex-col bg-surface-container ${showPane ? 'flex' : 'hidden md:flex'}`}
      >
        {/* Shared mobile-only back control for mail + notification kinds.
            Chat already renders its own back button inside ChatView. */}
        {selected && selected.kind !== 'chat' && (
          <div className="p-4 md:hidden">
            <Button
              variant="ghost"
              onClick={handleBack}
              aria-label={t('common.back', { defaultValue: 'Back' })}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('common.back', { defaultValue: 'Back' })}
            </Button>
          </div>
        )}
        {composing ? (
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-sans text-title font-bold">
                {composing === 'email'
                  ? t('inbox.compose.email', { defaultValue: 'New email' })
                  : t('inbox.compose.message', { defaultValue: 'New message' })}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setComposing(null)}
                aria-label={t('common.close', { defaultValue: 'Close' })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {composing === 'email' ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ComposeEmail
                  onSent={(emailId) => {
                    setComposing(null);
                    const saved = emailId ? mailboxSelection(emailId) : null;
                    if (saved) selectItem(saved);
                  }}
                  onCancel={() => setComposing(null)}
                />
              </div>
            ) : (
              <RecipientPicker
                onPicked={(conversationId) => {
                  setComposing(null);
                  const next = new URLSearchParams(searchParams);
                  next.set('conversation', conversationId);
                  next.delete('email');
                  next.delete('tripmail');
                  next.delete('notification');
                  next.delete('filter');
                  next.delete('unread');
                  next.delete('q');
                  setSearchParams(next, { replace: true });
                }}
              />
            )}
          </div>
        ) : selected?.kind === 'chat' ? (
          <ChatView
            key={selected.id}
            conversationId={selected.id.replace('conv_', '')}
            onBack={handleBack}
          />
        ) : selected?.kind === 'mail' ? (
          <MailDetail key={selected.id} emailId={selected.id.replace('mail_', '')} />
        ) : selected?.kind === 'trip_email' ? (
          <TripEmailThread key={selected.id} itemId={selected.id.replace('tripmail_', '')} />
        ) : selected?.kind === 'notification' ? (
          <NotificationDetailCard item={selected} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="px-4 text-center">
              <span
                aria-hidden
                className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-card shadow-soft"
              >
                <MessageCircle size={28} className="text-muted-foreground" />
              </span>
              <p className="mb-2 text-title font-bold">
                {t('inbox.welcome.title', { defaultValue: 'Your inbox, in one place' })}
              </p>
              <p className="text-15 text-muted-foreground">
                {t('inbox.welcome.body', {
                  defaultValue: 'Open a conversation, read your mail, or catch up on updates.',
                })}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
