import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, X, CalendarClock } from 'lucide-react';
import { useMessaging, type Message } from '@/hooks/useMessaging';
import { useAuth } from '@/hooks/useAuth';
import { IntimateMatchThread } from '@/components/messaging/IntimateMatchThread';
import { JoyBurst } from '@/components/messaging/JoyBurst';
import { TypingIndicatorRow } from '@/components/messaging/TypingIndicatorRow';
import { useConversationPresence } from '@/hooks/useConversationPresence';
import { useConversationAvailability } from '@/hooks/useConversationAvailability';
import { usePublicStatus } from '@/hooks/usePublicStatus';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import { useMessageListScroll } from './useMessageListScroll';
import { useJoyBurstTrigger } from './useJoyBurstTrigger';

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
export const ChatView = ({ conversationId, onBack }: ChatViewProps) => {
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
  const [composerKey, setComposerKey] = useState(0);

  const currentMessages = messages[conversationId] || [];
  const currentTypingUsers = typingUsers[conversationId] || [];
  const messageById = (id: string | null) =>
    id ? currentMessages.find((m) => m.id === id) ?? null : null;

  const { highlightedId, messagesEndRef, inputRef, scrollToMessage } = useMessageListScroll(
    conversationId,
    currentMessages.length,
  );

  useEffect(() => {
    void fetchMessages(conversationId);
    void markAsRead(conversationId);
  }, [conversationId, fetchMessages, markAsRead]);

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
  const { joy, setJoy } = useJoyBurstTrigger(conv?.conversation_type, currentMessages.length);

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
              <svg style={{ height: 20, width: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
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
              <MessageCircle size={48} style={{ margin: '0 auto 16px' }} className="text-muted-foreground" />
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
