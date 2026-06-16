import React, { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  MoreVertical,
  MessageCircle,
  Smile,
  Check,
  CheckCheck,
  Clock,
  Eye,
  ChevronLeft,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useMessaging, type Message, type TypingIndicator } from '@/hooks/useMessaging';
import { useAuth } from '@/hooks/useAuth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSearchParams } from 'react-router';
import { IntimateMatchThread } from '@/components/messaging/IntimateMatchThread';
import { useInboxFeed, type InboxFilter, type InboxItem } from '@/hooks/useInboxFeed';
import { InboxRailItem } from '@/components/messaging/InboxRailItem';
import { MailDetail } from '@/components/messaging/MailDetail';
import { NotificationDetailCard } from '@/components/messaging/NotificationDetailCard';
import { ComposeChooser } from '@/components/messaging/ComposeChooser';
import { ComposeEmail } from '@/components/inbox/ComposeEmail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  onReaction: (messageId: string, emoji: string) => void;
}

const MessageStatusIcon = ({ status }: { status?: Message['status'] }) => {
  switch (status) {
    case 'sending':
      return <Clock size={12} className="text-muted-foreground" />;
    case 'sent':
      return <Check size={12} className="text-muted-foreground" />;
    case 'delivered':
      return <CheckCheck size={12} className="text-muted-foreground" />;
    case 'read':
      return <Eye size={12} />;
    default:
      return null;
  }
};

const MessageItem = ({ message, isOwn, onReaction }: MessageItemProps) => {
  const [showReactions, setShowReactions] = useState(false);

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😠'];

  return (
    <div style={{ justifyContent: isOwn ? 'flex-end' : 'flex-start' }} className="flex mb-4">
      <div style={{ maxWidth: '70%', order: isOwn ? 2 : 1 }}>
        {!isOwn && (
          <div className="flex items-center gap-2 mb-1">
            <Avatar style={{ height: 24, width: 24 }}>
              <AvatarImage src={message.sender?.avatar_url || ''} />
              <AvatarFallback>{message.sender?.display_name?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">
              {message.sender?.display_name || 'Unknown User'}
            </span>
          </div>
        )}

        <div className="relative">
          <div
            style={{
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 'var(--radius-container)',
              ...(isOwn
                ? {
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    borderBottomRightRadius: 'var(--radius-element)',
                  }
                : {
                    backgroundColor: 'var(--muted)',
                    borderBottomLeftRadius: 'var(--radius-element)',
                  }),
              ...(message.status === 'sending' ? { opacity: 0.6 } : {}),
            }}
          >
            <p className="text-sm">{message.content}</p>
          </div>

          <div
            style={{ alignItems: 'center', justifyContent: 'space-between' }}
            className="flex mt-1"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
              </span>

              {isOwn && <MessageStatusIcon status={message.status} />}
            </div>

            <Button
              variant="ghost"
              size="sm"
              style={{ height: 24, width: 24, opacity: 0, transition: 'opacity 0.2s' }}
              className="p-0"
              onClick={() => setShowReactions(!showReactions)}
            >
              <Smile size={12} />
            </Button>
          </div>

          {showReactions && (
            <div
              className="rounded-container border border-border absolute mt-1 p-2"
              style={{ top: '100%', backgroundColor: 'var(--popover)', zIndex: 10 }}
            >
              <div className="flex gap-1">
                {commonEmojis.map((emoji) => (
                  <Button
                    key={emoji}
                    variant="ghost"
                    size="sm"
                    style={{ height: 32, width: 32, transition: 'background-color 0.2s' }}
                    className="p-0"
                    onClick={() => {
                      onReaction(message.id, emoji);
                      setShowReactions(false);
                    }}
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {message.reactions && message.reactions.length > 0 && (
            <div style={{ flexWrap: 'wrap' }} className="flex gap-1 mt-2">
              {message.reactions.map((reaction) => (
                <Badge key={reaction.id} variant="secondary" className="text-xs">
                  {reaction.emoji} 1
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface TypingIndicatorProps {
  typingUsers: TypingIndicator[];
}

const TypingIndicatorComponent = ({ typingUsers }: TypingIndicatorProps) => {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((user) => user.display_name).join(', ');
  const verb = typingUsers.length === 1 ? 'is' : 'are';

  return (
    <div
      style={{ alignItems: 'center' }}
      className="flex gap-2 pl-4 pr-4 pt-2 pb-2 text-sm text-muted-foreground"
    >
      <Avatar style={{ height: 24, width: 24 }}>
        <AvatarFallback className="text-xs">
          {typingUsers[0]?.display_name?.charAt(0) || 'U'}
        </AvatarFallback>
      </Avatar>
      <span>
        {names} {verb} typing
      </span>
      <div className="flex gap-1">
        <div className="w-1 h-1 bg-primary rounded-full" />
        <div className="w-1 h-1 bg-primary rounded-full" />
        <div className="w-1 h-1 bg-primary rounded-full" />
      </div>
    </div>
  );
};

interface MessageInputProps {
  onSend: (content: string) => void;
  onTyping: () => void;
  onStopTyping: () => void;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  /** Pre-populate the composer with this text. Latest non-empty value wins. */
  prefilledMessage?: string | null;
}

const MessageInput = ({
  onSend,
  onTyping,
  onStopTyping,
  disabled,
  inputRef,
  prefilledMessage,
}: MessageInputProps) => {
  const [message, setMessage] = useState('');

  // Allow parents (e.g. IntimateMatchThread opening-move chips) to seed the
  // composer. Setting from an external value via effect is intentional here.
  useEffect(() => {
    if (prefilledMessage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setMessage(prefilledMessage);
       
      inputRef?.current?.focus();
    }
  }, [prefilledMessage, inputRef]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Common emojis for quick access
  const commonEmojis = [
    '😀',
    '😂',
    '🥰',
    '😍',
    '🤔',
    '👍',
    '👎',
    '❤️',
    '🔥',
    '💯',
    '😊',
    '😎',
    '🙄',
    '😴',
    '🤗',
    '👋',
    '👏',
    '🎉',
    '💪',
    '🙏',
    '😢',
    '😭',
    '😡',
    '😱',
    '🤯',
    '🥺',
    '😤',
    '🤮',
    '😷',
    '🤒',
  ];

  // Add emoji to message
  const addEmoji = (emoji: string) => {
    setMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef?.current?.focus();
  };

  // Sanitize message input to prevent XSS
  const sanitizeMessage = (input: string): string => {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    }).trim();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedMessage = sanitizeMessage(message);
    if (sanitizedMessage && !disabled) {
      onSend(sanitizedMessage);
      setMessage('');
      onStopTyping();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = sanitizeMessage(e.target.value);
    setMessage(value);

    // Send typing indicator
    onTyping();

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 1 second of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      onStopTyping();
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        borderTop: '1px solid var(--border)',
        backgroundColor: 'color-mix(in srgb, var(--background) 50%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
      className="flex gap-2 p-4"
    >
      <Input
        ref={inputRef}
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        className="rounded-element"
        style={{ flex: 1, height: 44, transition: 'border-color 0.2s' }}
        maxLength={2000}
      />

      {/* Emoji Picker */}
      <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-element p-0"
            style={{ height: 44, width: 44 }}
            disabled={disabled}
          >
            <Smile size={20} />
          </Button>
        </PopoverTrigger>
        <PopoverContent style={{ width: 320 }} className="p-4" side="top">
          <div className="flex flex-col gap-4">
            <p className="font-medium text-sm">Choose an emoji</p>
            <div className="grid grid-cols-8 md:grid-cols-10 gap-1">
              {commonEmojis.map((emoji, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  style={{ height: 32, width: 32, transition: 'background-color 0.2s' }}
                  className="p-0"
                  onClick={() => addEmoji(emoji)}
                >
                  <span className="text-lg">{emoji}</span>
                </Button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="submit"
        disabled={disabled || !message.trim()}
        className="rounded-element p-0"
        style={{ height: 44, width: 44, transition: 'all 0.2s' }}
        size="sm"
      >
        <Send size={20} />
      </Button>
    </form>
  );
};

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
  const { user } = useAuth();
  const {
    conversations,
    messages,
    sendingMessage,
    typingUsers,
    fetchMessages,
    sendMessage,
    addReaction,
    markAsRead,
    sendTypingIndicator,
    stopTypingIndicator,
  } = useMessaging();

  const [prefilledMessage, setPrefilledMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentMessages = messages[conversationId] || [];
  const currentTypingUsers = typingUsers[conversationId] || [];

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
    await sendMessage(conversationId, content);
    await stopTypingIndicator(conversationId);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    await addReaction(messageId, emoji);
  };

  const conv = conversations.find((c) => c.id === conversationId);
  const otherParticipant = conv?.participants?.find((p) => p.user_id !== user?.id);

  return (
    <>
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
              <div
                className="rounded-full absolute"
                style={{
                  bottom: -2,
                  right: -2,
                  width: 12,
                  height: 12,
                  backgroundColor: 'hsl(var(--foreground))',
                  border: '2px solid var(--background)',
                }}
              ></div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                {otherParticipant?.profile?.display_name || 'Unknown User'}
              </p>
              <p className="text-sm text-foreground">Online</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="rounded-element p-0"
            style={{ height: 36, width: 36 }}
          >
            <MoreVertical size={16} />
          </Button>
        </div>
      </div>

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
              {currentMessages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isOwn={message.sender_id === user?.id}
                  onReaction={handleReaction}
                />
              ))}

              <TypingIndicatorComponent typingUsers={currentTypingUsers} />
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Message Input */}
      <MessageInput
        onSend={handleSendMessage}
        onTyping={() => sendTypingIndicator(conversationId)}
        onStopTyping={() => stopTypingIndicator(conversationId)}
        disabled={sendingMessage}
        inputRef={inputRef}
        prefilledMessage={prefilledMessage}
      />
    </>
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
  const navigate = useLocalizedNavigate();
  const [composeEmailOpen, setComposeEmailOpen] = useState(false);

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

      {/* Merged inbox rail - full width on mobile, 1/3 on desktop */}
      <div
        className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 border-r flex-col`}
        style={{ backgroundColor: 'rgba(var(--background-rgb), 0.5)' }}
      >
        {/* Rail header */}
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <span className="text-sm font-medium text-foreground">
            {t('inbox.title', { defaultValue: 'Inbox' })}
          </span>
          <ComposeChooser
            onNewMessage={() => navigate('/community/members')}
            onNewEmail={() => setComposeEmailOpen(true)}
          />
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
          ) : items.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle
                size={48}
                style={{ margin: '0 auto 16px' }}
                className="text-muted-foreground"
              />
              <p className="text-muted-foreground">
                {t('inbox.empty', { defaultValue: 'Nothing here yet.' })}
              </p>
            </div>
          ) : (
            <div>
              {items.map((item) => (
                <InboxRailItem
                  key={item.id}
                  item={item}
                  active={selected?.id === item.id}
                  onSelect={handleSelect}
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
