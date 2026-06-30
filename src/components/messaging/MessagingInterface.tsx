import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageCircle,
  ChevronLeft,
  X,
  Search,
  CalendarClock,
} from 'lucide-react';
import { useMessaging, type Message } from '@/hooks/useMessaging';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams } from 'react-router';
import { IntimateMatchThread } from '@/components/messaging/IntimateMatchThread';
import { JoyBurst } from '@/components/messaging/JoyBurst';
import { VibeEditor } from '@/components/messaging/VibeEditor';
import { useInboxFeed, type InboxFilter, type InboxItem } from '@/hooks/useInboxFeed';
import { InboxRailItem } from '@/components/messaging/InboxRailItem';
import { TypingIndicatorRow } from '@/components/messaging/TypingIndicatorRow';
import { MessageItem } from '@/components/messaging/MessageItem';
import { MessageInput } from '@/components/messaging/MessageInput';
import { TripRailCard } from '@/components/messaging/TripRailCard';
import { useUpcomingTrips } from '@/hooks/useUpcomingTrips';
import { useGlobalPresence, useConversationPresence } from '@/hooks/useConversationPresence';
import { useRailActions } from '@/hooks/useRailActions';
import { useConversationAvailability } from '@/hooks/useConversationAvailability';
import { usePublicStatus } from '@/hooks/usePublicStatus';
import { MailDetail } from '@/components/messaging/MailDetail';
import { NotificationDetailCard } from '@/components/messaging/NotificationDetailCard';
import { ComposeChooser } from '@/components/messaging/ComposeChooser';
import { RecipientPicker } from '@/components/messaging/RecipientPicker';
import { ComposeEmail } from '@/components/inbox/ComposeEmail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface ChatViewProps {
  conversationId: string;
  onBack: () => void;
}

/**
 * The live chat detail pane: header, optional match ribbon, message list,
 * typing indicator, reactions, and composer. Owns its own useMessaging instance
 * (per-instance realtime channel topics), so it can be mounted on demand from
 * the unified inbox switch without disturbing the rail.
 */
const ChatView = ({ conversationId, onBack }: ChatViewProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    conversations,
    messages,
    sendingMessage,
    typingUsers,
    fetchMessages,
    sendMessage,
    addReaction,
    editMessage,
    deleteMessage,
    markAsRead,
    sendTypingIndicator,
    stopTypingIndicator,
  } = useMessaging();

  const [prefilledMessage, setPrefilledMessage] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentMessages = messages[conversationId] || [];
  const currentTypingUsers = typingUsers[conversationId] || [];
  const messageById = (id: string | null) =>
    id ? currentMessages.find((m) => m.id === id) ?? null : null;

  useEffect(() => {
    void fetchMessages(conversationId);
    void markAsRead(conversationId);
  }, [conversationId, fetchMessages, markAsRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [conversationId]);

  const handleSendMessage = async (content: string) => {
    if (editing) {
      await editMessage(editing.id, content);
      setEditing(null);
    } else {
      await sendMessage(conversationId, content, replyTarget?.id);
      setReplyTarget(null);
    }
    await stopTypingIndicator(conversationId);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    await addReaction(messageId, emoji);
  };

  const handleReply = (message: Message) => {
    setEditing(null);
    setReplyTarget(message);
    inputRef.current?.focus();
  };

  const handleEdit = (message: Message) => {
    setReplyTarget(null);
    setEditing(message);
    setPrefilledMessage(message.content);
    setComposerKey((k) => k + 1);
    inputRef.current?.focus();
  };

  const cancelContext = () => {
    setReplyTarget(null);
    if (editing) {
      setEditing(null);
      setPrefilledMessage(null);
      setComposerKey((k) => k + 1);
    }
  };

  const scrollToMessage = (messageId: string) => {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    setHighlightedId(messageId);
    setTimeout(() => setHighlightedId((cur) => (cur === messageId ? null : cur)), 1500);
  };

  const conv = conversations.find((c) => c.id === conversationId);
  const otherParticipant = conv?.participants?.find((p) => p.user_id !== user?.id);
  const onlineInThread = useConversationPresence(conversationId);
  const { status: otherStatus } = usePublicStatus(otherParticipant?.user_id);
  const isOtherOnline = otherParticipant ? onlineInThread.has(otherParticipant.user_id) : false;
  const vibeEmoji = otherParticipant?.profile?.vibe_emoji ?? null;
  const vibeText = otherParticipant?.profile?.vibe_text ?? null;
  const vibeExpiresAt = otherParticipant?.profile?.vibe_expires_at ?? null;
  const firstMessageAt = currentMessages.length > 1 ? currentMessages[0].created_at : null;
  // Date.now() lives in useMemo (not render) to satisfy the purity rule; it
  // re-evaluates whenever the inputs change, which is fresh enough for both.
  /* eslint-disable react-hooks/purity, react-hooks/preserve-manual-memoization --
     time-derived display values (vibe expiry + streak); Date.now() in the memo is
     fresh enough and deps are read-only const projections. */
  const { vibeActive, streakDays } = useMemo(() => {
    const now = Date.now();
    const active = !!vibeText && (!vibeExpiresAt || new Date(vibeExpiresAt).getTime() > now);
    const days = firstMessageAt
      ? Math.floor((now - new Date(firstMessageAt).getTime()) / 86_400_000)
      : 0;
    return { vibeActive: active, streakDays: days };
  }, [vibeText, vibeExpiresAt, firstMessageAt]);
  /* eslint-enable react-hooks/purity, react-hooks/preserve-manual-memoization */
  const presenceLabel = isOtherOnline
    ? t('chat.activeNow', { defaultValue: 'Active now' })
    : vibeActive
      ? `${vibeEmoji ?? '✨'} ${vibeText}`
      : otherStatus?.text
        ? otherStatus.text
        : null;

  // Free-to-meet availability for this thread (self + other).
  const {
    selfAvailable,
    otherAvailable,
    toggle: toggleAvailability,
  } = useConversationAvailability(conversationId, otherParticipant?.user_id);

  // Queer-joy burst when a new match thread gets its first message.
  const [joy, setJoy] = useState(false);
  const prevLenRef = useRef(0);
  useEffect(() => {
    const prev = prevLenRef.current;
    if (conv?.conversation_type === 'match' && prev === 0 && currentMessages.length > 0) {
      setJoy(true);
    }
    prevLenRef.current = currentMessages.length;
  }, [currentMessages.length, conv?.conversation_type]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {joy && <JoyBurst onDone={() => setJoy(false)} />}
      {/* Chat Header */}
      <div
        className="p-4 md:p-4 border-b"
        style={{
          backgroundColor: 'rgba(var(--background-rgb), 0.5)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Back button for mobile */}
            <Button
              variant="ghost"
              size="sm"
              style={{ height: 36, width: 36 }}
              className="p-0 md:hidden"
              onClick={onBack}
            >
              <svg
                style={{ height: 20, width: 20 }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Button>

            <div className="relative">
              <Avatar style={{ height: 40, width: 40 }}>
                <AvatarImage src={otherParticipant?.profile?.avatar_url || ''} />
                <AvatarFallback>
                  {otherParticipant?.profile?.display_name?.charAt(0) || 'C'}
                </AvatarFallback>
              </Avatar>
              {isOtherOnline && (
                <div
                  className="rounded-full absolute bg-foreground"
                  style={{
                    bottom: -2,
                    right: -2,
                    width: 12,
                    height: 12,
                    border: '2px solid var(--background)',
                  }}
                ></div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                {otherParticipant?.profile?.display_name || 'Unknown User'}
              </p>
              {presenceLabel && (
                <p className="text-sm text-muted-foreground truncate">{presenceLabel}</p>
              )}
            </div>
          </div>

          <Button
            variant={selfAvailable ? 'accent' : 'ghost'}
            size="sm"
            className="rounded-element gap-1 px-2"
            style={{ height: 36 }}
            onClick={toggleAvailability}
            title={t('chat.freeToMeet.title', { defaultValue: 'Free to meet' })}
          >
            <CalendarClock size={16} />
            <span className="hidden text-13 sm:inline">
              {selfAvailable
                ? t('chat.freeToMeet.on', { defaultValue: 'Free now' })
                : t('chat.freeToMeet.set', { defaultValue: 'Free to meet' })}
            </span>
          </Button>
        </div>
      </div>

      {/* Free-to-meet ribbon */}
      {(otherAvailable || selfAvailable) && (
        <div className="border-b border-border bg-muted/50 px-4 py-1.5 text-center text-13 text-muted-foreground">
          {otherAvailable
            ? t('chat.freeToMeet.both', {
                defaultValue: '{{name}} is free to meet right now 🟢',
                name: otherParticipant?.profile?.display_name || 'They',
              })
            : t('chat.freeToMeet.youOnly', { defaultValue: "You're marked free to meet 🟢" })}
        </div>
      )}

      {/* Match thread ribbon — only for conversation_type='match' */}
      {conv?.conversation_type === 'match' && (
        <div className="px-4 pt-4 md:px-4 md:pt-4">
          <IntimateMatchThread
            conversationId={conversationId}
            hasMessages={currentMessages.length > 0}
            onPickOpeningMove={(prompt) => setPrefilledMessage(prompt)}
          />
        </div>
      )}

      {/* Messages */}
      <ScrollArea
        style={{
          flex: 1,
          background:
            'linear-gradient(to bottom, color-mix(in srgb, var(--background) 50%, transparent), var(--background))',
        }}
      >
        <div className="p-4 md:p-4">
          {currentMessages.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle
                size={48}
                style={{ margin: '0 auto 16px' }}
                className="text-muted-foreground"
              />
              <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <div>
              {streakDays >= 2 && (
                <p className="mb-4 text-center text-2xs text-muted-foreground">
                  {t('chat.streak', {
                    defaultValue: 'You two have been chatting for {{count}} days ✨',
                    count: streakDays,
                  })}
                </p>
              )}
              {currentMessages.map((rawMessage) => {
                const isOwn = rawMessage.sender_id === user?.id;
                // Derive read receipt: own message is "read" once the other
                // participant's last_read_at is at/after it.
                const otherRead = otherParticipant?.last_read_at
                  ? new Date(otherParticipant.last_read_at).getTime()
                  : 0;
                const message =
                  isOwn &&
                  otherRead &&
                  new Date(rawMessage.created_at).getTime() <= otherRead &&
                  rawMessage.status !== 'sending'
                    ? { ...rawMessage, status: 'read' as const }
                    : rawMessage;
                return (
                <MessageItem
                  key={message.id}
                  message={message}
                  isOwn={isOwn}
                  currentUserId={user?.id}
                  replyingTo={messageById(message.reply_to_id)}
                  highlighted={highlightedId === message.id}
                  onReaction={handleReaction}
                  onReply={handleReply}
                  onEdit={handleEdit}
                  onDelete={deleteMessage}
                  onScrollToMessage={scrollToMessage}
                />
                );
              })}

              <TypingIndicatorRow typingUsers={currentTypingUsers} />
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Reply / edit context banner */}
      {(replyTarget || editing) && (
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/50 px-4 py-2">
          <div className="min-w-0">
            <p className="text-2xs font-medium text-foreground">
              {editing
                ? t('chat.editing', { defaultValue: 'Editing message' })
                : t('chat.replyingTo', {
                    defaultValue: 'Replying to {{name}}',
                    name:
                      replyTarget?.sender?.display_name ||
                      t('chat.reply.someone', { defaultValue: 'someone' }),
                  })}
            </p>
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {editing ? editing.content : replyTarget?.content}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            aria-label={t('common.cancel', { defaultValue: 'Cancel' })}
            onClick={cancelContext}
          >
            <X size={16} />
          </Button>
        </div>
      )}

      {/* Message Input */}
      <MessageInput
        key={composerKey}
        onSend={handleSendMessage}
        onTyping={() => sendTypingIndicator(conversationId)}
        onStopTyping={() => stopTypingIndicator(conversationId)}
        disabled={sendingMessage}
        inputRef={inputRef}
        prefilledMessage={prefilledMessage}
        onSticker={(emoji) => {
          void sendMessage(conversationId, emoji, undefined, 'sticker');
          void stopTypingIndicator(conversationId);
        }}
      />
    </div>
  );
};

export interface MessagingInterfaceProps {
  /**
   * Active inbox filter for the merged rail (chats + mail + notifications).
   * Defaults to 'all'.
   */
  filter?: InboxFilter;
}

export const MessagingInterface = ({ filter }: MessagingInterfaceProps = {}) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { items, loading } = useInboxFeed(filter ?? 'all');
  const { data: upcomingTrips } = useUpcomingTrips();
  const showTripCards = filter === 'all' || filter === 'trips';
  const onlineUsers = useGlobalPresence();
  const railActions = useRailActions();
  const [composeEmailOpen, setComposeEmailOpen] = useState(false);
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const [serverResults, setServerResults] = useState<InboxItem[]>([]);

  // Server-side message-body/title search across all the user's conversations
  // (the client filter below only covers the already-loaded feed). Debounced.
  useEffect(() => {
    const q = search.trim();
    if (!user || q.length <= 2) {
      // Intentional reset of the debounced server-search when the query is too
      // short; harmless, not a cascading render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServerResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_inbox', {
        p_user: user.id,
        p_query: q,
        p_limit: 30,
      } as never);
      if (!cancelled) setServerResults(((data as InboxItem[]) ?? []));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, user]);

  const visibleItems = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    const clientMatches = items.filter(
      (i) => i.title.toLowerCase().includes(q) || i.preview.toLowerCase().includes(q),
    );
    const seen = new Set(clientMatches.map((i) => i.id));
    return [...clientMatches, ...serverResults.filter((i) => !seen.has(i.id))];
  })();

  const [selected, setSelected] = useState<InboxItem | null>(null);

  // Deep-link: preselect a chat when ?conversation=<id> is present, or a mail
  // item when ?email=<id> is present, once the matching item has loaded into
  // the feed.
  useEffect(() => {
    if (selected) return;
    const conversationId = searchParams.get('conversation');
    if (conversationId) {
      const match = items.find((i) => i.id === `conv_${conversationId}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time deep-link preselect once the matching item loads into the feed; documented exemption from the eslint.config.js staged-ratchet plan.
      if (match) setSelected(match);
      return;
    }
    const emailId = searchParams.get('email');
    if (emailId) {
      const match = items.find((i) => i.id === `mail_${emailId}`);
      if (match) setSelected(match);
    }
  }, [searchParams, items, selected]);

  // Reset selection when the filter chip changes. Skip the very first render so
  // the deep-link effect above can still establish its initial selection before
  // we'd accidentally null it out (both effects fire on mount; the hasMounted
  // guard ensures we only reset on *subsequent* filter changes driven by user
  // interaction).
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setSelected(null);
    if (searchParams.has('conversation') || searchParams.has('email')) {
      const next = new URLSearchParams(searchParams);
      next.delete('conversation');
      next.delete('email');
      setSearchParams(next, { replace: true });
    }
    // searchParams intentionally omitted — we only want to react to filter changes,
    // not re-run every time the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleSelect = (item: InboxItem) => {
    setSelected(item);
    const next = new URLSearchParams(searchParams);
    if (item.kind === 'chat') {
      next.set('conversation', item.id.replace('conv_', ''));
      next.delete('email');
    } else if (item.kind === 'mail') {
      next.set('email', item.id.replace('mail_', ''));
      next.delete('conversation');
    } else {
      // notification (or anything else) carries no deep-link param
      next.delete('conversation');
      next.delete('email');
    }
    setSearchParams(next, { replace: true });
  };

  const handleBack = () => {
    setSelected(null);
    if (searchParams.has('conversation') || searchParams.has('email')) {
      const next = new URLSearchParams(searchParams);
      next.delete('conversation');
      next.delete('email');
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-200px)] md:h-[600px] overflow-hidden bg-background">
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
              <MessageCircle
                size={48}
                style={{ margin: '0 auto 16px' }}
                className="text-muted-foreground"
              />
              <p className="text-muted-foreground">
                {search.trim()
                  ? t('inbox.searchEmpty', { defaultValue: 'No matches.' })
                  : t('inbox.empty', { defaultValue: 'Nothing here yet.' })}
              </p>
            </div>
          ) : (
            <div>
              {showTripCards && upcomingTrips && upcomingTrips.length > 0 && (
                <div className="border-b">
                  {upcomingTrips.map((trip) => (
                    <TripRailCard key={trip.id} trip={trip} />
                  ))}
                </div>
              )}
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
              <MessageCircle
                size={64}
                style={{ margin: '0 auto 16px' }}
                className="text-muted-foreground"
              />
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
