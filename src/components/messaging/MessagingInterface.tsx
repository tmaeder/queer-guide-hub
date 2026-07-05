import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, ChevronLeft, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams } from 'react-router';
import { VibeEditor } from '@/components/messaging/VibeEditor';
import { useInboxFeed, type InboxFilter } from '@/hooks/useInboxFeed';
import { InboxRailItem } from '@/components/messaging/InboxRailItem';
import { CalendarRailStrip } from '@/components/messaging/CalendarRailStrip';
import { useGlobalPresence } from '@/hooks/useConversationPresence';
import { useRailActions } from '@/hooks/useRailActions';
import { MailDetail } from '@/components/messaging/MailDetail';
import { TripEmailThread } from '@/components/messaging/TripEmailThread';
import { NotificationDetailCard } from '@/components/messaging/NotificationDetailCard';
import { ComposeChooser } from '@/components/messaging/ComposeChooser';
import { RecipientPicker } from '@/components/messaging/RecipientPicker';
import { ComposeEmail } from '@/components/inbox/ComposeEmail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChatView } from '@/components/messaging/chat/ChatView';
import { useInboxSearch } from '@/components/messaging/chat/useInboxSearch';
import { useInboxSelection } from '@/components/messaging/chat/useInboxSelection';

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
  const { items, loading } = useInboxFeed(filter ?? 'all');
  const showTripCards = filter === 'all' || filter === 'trips';
  const onlineUsers = useGlobalPresence();
  const railActions = useRailActions();
  const [composeEmailOpen, setComposeEmailOpen] = useState(false);
  const [recipientOpen, setRecipientOpen] = useState(false);
  const { user } = useAuth();

  const { search, setSearch, visibleItems } = useInboxSearch(items, user);
  const { selected, handleSelect, handleBack } = useInboxSelection(
    filter,
    items,
    searchParams,
    setSearchParams,
  );

  return (
    <div
      className={cn(
        'flex flex-col md:flex-row h-[calc(100vh-200px)] md:h-[600px] overflow-hidden bg-background',
        className,
      )}
    >
      {/* Email compose sheet */}
      <Sheet open={composeEmailOpen} onOpenChange={setComposeEmailOpen}>
        <SheetContent side="bottom">
          <SheetHeader className="mb-4">
            <SheetTitle>{t('inbox.compose.email', { defaultValue: 'New email' })}</SheetTitle>
          </SheetHeader>
          <ComposeEmail onSent={() => setComposeEmailOpen(false)} onCancel={() => setComposeEmailOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* New-message recipient picker */}
      <RecipientPicker
        open={recipientOpen}
        onOpenChange={setRecipientOpen}
        onPicked={(conversationId) => {
          const next = new URLSearchParams(searchParams);
          next.set('conversation', conversationId);
          next.delete('email');
          setSearchParams(next, { replace: true });
        }}
      />

      {/* Merged inbox rail - full width on mobile, 1/3 on desktop */}
      <div
        className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 border-r flex-col`}
        style={{ backgroundColor: 'rgba(var(--background-rgb), 0.5)' }}
      >
        {/* Rail header */}
        <div className="border-b">
          <div className="flex items-center justify-between px-4 py-2">
            <VibeEditor />
            <ComposeChooser
              onNewMessage={() => setRecipientOpen(true)}
              onNewEmail={() => setComposeEmailOpen(true)}
            />
          </div>
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('inbox.search', { defaultValue: 'Search' })}
                className="h-9 rounded-element pl-8"
              />
            </div>
          </div>
        </div>
        <ScrollArea style={{ flex: 1 }}>
          {/* Upcoming trips + saved events — shown above the inbox regardless of
              whether the inbox itself has items (returns null when empty). */}
          {showTripCards && !search.trim() && <CalendarRailStrip />}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4 animate-spin" />
                <p className="text-muted-foreground">
                  {t('inbox.loading', { defaultValue: 'Loading…' })}
                </p>
              </div>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle size={48} style={{ margin: '0 auto 16px' }} className="text-muted-foreground" />
              <p className="text-muted-foreground">
                {search.trim()
                  ? t('inbox.searchEmpty', { defaultValue: 'No matches.' })
                  : t('inbox.empty', { defaultValue: 'Nothing here yet.' })}
              </p>
            </div>
          ) : (
            <div>
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
        </ScrollArea>
      </div>

      {/* Right pane - per-kind detail */}
      <div className={`flex-1 flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
        {/* Shared mobile-only back control for mail + notification kinds.
            Chat already renders its own back button inside ChatView. */}
        {selected && selected.kind !== 'chat' && (
          <div className="md:hidden border-b p-4">
            <button
              onClick={handleBack}
              aria-label={t('common.back', { defaultValue: 'Back' })}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('common.back', { defaultValue: 'Back' })}
            </button>
          </div>
        )}
        {selected?.kind === 'chat' ? (
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
          <div
            className="flex-1 flex items-center justify-center"
            style={{
              background:
                'linear-gradient(to bottom, rgba(var(--background-rgb), 0.5), var(--background))',
            }}
          >
            <div className="text-center px-4">
              <MessageCircle size={64} style={{ margin: '0 auto 16px' }} className="text-muted-foreground" />
              <h6 className="text-lg font-medium mb-2">
                {t('inbox.selectPrompt.title', { defaultValue: 'Select an item' })}
              </h6>
              <p className="text-muted-foreground text-sm md:text-base">
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
