import { useEffect, useState } from 'react';
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
}

export const MessagingInterface = ({ filter, className }: MessagingInterfaceProps = {}) => {
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

  const { search, setSearch, visibleItems } = useInboxSearch(items, user, filter === 'mail');
  const {
    selected,
    handleSelect: selectItem,
    handleBack: clearSelection,
  } = useInboxSelection(filter, items, searchParams, setSearchParams);
  const handleSelect: typeof selectItem = (item) => {
    setComposing(null);
    selectItem(item);
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

  return (
    <div
      className={cn(
        'flex flex-col md:flex-row h-[calc(100vh-200px)] md:h-[600px] overflow-hidden rounded-container bg-card shadow-soft',
        className,
      )}
    >
      {/* Merged inbox rail - full width on mobile, 1/3 on desktop */}
      {/* The list sits on the card's white, the reading pane on a light wash:
          the tonal step separates them, so no hairline is needed. */}
      <div className={`${showPane ? 'hidden md:flex' : 'flex'} w-full flex-col md:w-1/3`}>
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
        {/* Radix wraps the content in display:table, which stops long titles
            from truncating with an ellipsis; block layout restores it. */}
        <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <TrackLoader
                size={32}
                label={t('inbox.loading', { defaultValue: 'Loading messages' })}
              />
            </div>
          ) : error && items.length === 0 ? (
            <div className="space-y-4 p-4" role="alert">
              <p>{t('inbox.mail.loadError')}</p>
              <Button variant="outline" onClick={() => void refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <span
                aria-hidden
                className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted"
              >
                <MessageCircle size={22} className="text-muted-foreground" />
              </span>
              <p className="text-15 text-muted-foreground">
                {search.trim()
                  ? t('inbox.searchEmpty', { defaultValue: 'No matches.' })
                  : t('inbox.empty', { defaultValue: 'Nothing here yet.' })}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2 pb-2">
              {visibleItems.map((item) => (
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
          {!loading && items.length > 0 && error && (
            <p className="px-4 pb-4 text-sm" role="alert">
              {t('inbox.mail.loadError')}
            </p>
          )}
          {!loading && hasNextPage && (
            <div className="px-4 pb-4">
              <Button
                variant="outline"
                className="w-full"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? t('common.loading') : t('common.loadMore')}
              </Button>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right pane - per-kind detail */}
      <div
        className={`min-w-0 flex-1 flex-col bg-surface-container ${showPane ? 'flex' : 'hidden md:flex'}`}
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
                {t('inbox.selectPrompt.title', { defaultValue: 'Select an item' })}
              </p>
              <p className="text-15 text-muted-foreground">
                {t('inbox.selectPrompt.body', {
                  defaultValue: 'Choose a message, email, or alert from the list.',
                })}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
