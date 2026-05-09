import React, { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Send,
  MoreVertical,
  Search,
  Plus,
  MessageCircle,
  Smile,
  Check,
  CheckCheck,
  Clock,
  Eye,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useMessaging,
  type Conversation,
  type Message,
  type TypingIndicator,
} from '@/hooks/useMessaging';
import { useAuth } from '@/hooks/useAuth';
import { UserModeBadge } from '@/components/profile/UserModeBadge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSearchParams } from 'react-router';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  onReaction: (messageId: string, emoji: string) => void;
}

const MessageStatusIcon = ({ status }: { status?: Message['status'] }) => {
  switch (status) {
    case 'sending':
      return <Clock style={{ height: 12, width: 12, color: 'hsl(var(--muted-foreground))' }} />;
    case 'sent':
      return <Check style={{ height: 12, width: 12, color: 'hsl(var(--muted-foreground))' }} />;
    case 'delivered':
      return <CheckCheck style={{ height: 12, width: 12, color: 'hsl(var(--muted-foreground))' }} />;
    case 'read':
      return <Eye style={{ height: 12, width: 12 }} />;
    default:
      return null;
  }
};

const MessageItem = ({ message, isOwn, onReaction }: MessageItemProps) => {
  const [showReactions, setShowReactions] = useState(false);

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😠'];

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: 16,
      }}
    >
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
              borderRadius: 16,
              ...(isOwn
                ? {
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    borderBottomRightRadius: 6,
                  }
                : { backgroundColor: 'var(--muted)', borderBottomLeftRadius: 6 }),
              ...(message.status === 'sending' ? { opacity: 0.6 } : {}),
            }}
          >
            <p className="text-sm">{message.content}</p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 4,
            }}
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
              style={{ height: 24, width: 24, padding: 0, opacity: 0, transition: 'opacity 0.2s' }}
              onClick={() => setShowReactions(!showReactions)}
            >
              <Smile style={{ height: 12, width: 12 }} />
            </Button>
          </div>

          {showReactions && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                marginTop: 4,
                backgroundColor: 'var(--popover)',
                borderRadius: 8,
                padding: 8,
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                zIndex: 10,
              }}
            >
              <div className="flex gap-1">
                {commonEmojis.map((emoji) => (
                  <Button
                    key={emoji}
                    variant="ghost"
                    size="sm"
                    style={{
                      height: 32,
                      width: 32,
                      padding: 0,
                      transition: 'background-color 0.2s',
                    }}
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {message.reactions.map((reaction) => (
                <Badge key={reaction.id} variant="secondary" style={{ fontSize: '0.75rem' }}>
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 8,
        paddingBottom: 8,
        fontSize: '0.875rem',
        color: 'var(--muted-foreground)',
      }}
    >
      <Avatar style={{ height: 24, width: 24 }}>
        <AvatarFallback style={{ fontSize: '0.75rem' }}>
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

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: string | null;
  onSelectConversation: (conversationId: string) => void;
  currentUserId: string;
}

const ConversationList = ({
  conversations,
  selectedConversation,
  onSelectConversation,
  currentUserId,
}: ConversationListProps) => {
  const getConversationTitle = (conversation: Conversation) => {
    if (conversation.conversation_type === 'group') {
      return conversation.title || 'Group Chat';
    }

    // For direct messages, show the other participant's name
    const otherParticipant = conversation.participants?.find((p) => p.user_id !== currentUserId);
    return otherParticipant?.profile?.display_name || 'Unknown User';
  };

  const getConversationAvatar = (conversation: Conversation) => {
    if (conversation.conversation_type === 'group') {
      return null; // Could show group avatar
    }

    const otherParticipant = conversation.participants?.find((p) => p.user_id !== currentUserId);
    return otherParticipant?.profile?.avatar_url;
  };

  const getOtherParticipant = (conversation: Conversation) => {
    if (conversation.conversation_type === 'group') {
      return null;
    }

    return conversation.participants?.find((p) => p.user_id !== currentUserId);
  };

  return (
    <div className="flex flex-col gap-2">
      {conversations.map((conversation) => (
        <Card
          key={conversation.id}
          style={{
            cursor: 'pointer',
            transition: 'all 0.2s',
            ...(selectedConversation === conversation.id
              ? { boxShadow: '0 0 0 2px hsl(var(--primary))', borderColor: 'hsl(var(--primary))' }
              : {}),
          }}
          onClick={() => onSelectConversation(conversation.id)}
        >
          <CardContent style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48 }}>
              <Avatar>
                <AvatarImage src={getConversationAvatar(conversation) || ''} />
                <AvatarFallback>{getConversationTitle(conversation).charAt(0)}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-medium overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                      {getConversationTitle(conversation)}
                    </p>
                    {getOtherParticipant(conversation)?.profile?.user_mode && (
                      <UserModeBadge
                        mode={getOtherParticipant(conversation)?.profile?.user_mode || ''}
                        size="sm"
                      />
                    )}
                  </div>
                  {conversation.last_message_at && (
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(conversation.last_message_at), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>

                {conversation.last_message && (
                  <p className="text-sm text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                    {conversation.last_message.content}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

interface MessageInputProps {
  onSend: (content: string) => void;
  onTyping: () => void;
  onStopTyping: () => void;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}

const MessageInput = ({
  onSend,
  onTyping,
  onStopTyping,
  disabled,
  inputRef,
}: MessageInputProps) => {
  const [message, setMessage] = useState('');
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
        display: 'flex',
        gap: 8,
        padding: 12,
        borderTop: '1px solid var(--border)',
        backgroundColor: 'color-mix(in srgb, var(--background) 50%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Input
        ref={inputRef}
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        style={{ flex: 1, borderRadius: 9999, height: 44, transition: 'border-color 0.2s' }}
        maxLength={2000}
      />

      {/* Emoji Picker */}
      <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            style={{ borderRadius: '50%', height: 44, width: 44, padding: 0 }}
            disabled={disabled}
          >
            <Smile style={{ height: 20, width: 20 }} />
          </Button>
        </PopoverTrigger>
        <PopoverContent style={{ width: 320, padding: 16 }} side="top">
          <div className="flex flex-col gap-3">
            <p className="font-medium text-sm">Choose an emoji</p>
            <div className="grid grid-cols-8 md:grid-cols-10 gap-1">
              {commonEmojis.map((emoji, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  style={{ height: 32, width: 32, padding: 0, transition: 'background-color 0.2s' }}
                  onClick={() => addEmoji(emoji)}
                >
                  <span style={{ fontSize: '1.125rem' }}>{emoji}</span>
                </Button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="submit"
        disabled={disabled || !message.trim()}
        style={{ borderRadius: '50%', height: 44, width: 44, padding: 0, transition: 'all 0.2s' }}
        size="sm"
      >
        <Send style={{ height: 20, width: 20 }} />
      </Button>
    </form>
  );
};

export const MessagingInterface = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    conversations,
    messages,
    loading,
    sendingMessage,
    typingUsers,
    fetchMessages,
    sendMessage,
    addReaction,
    markAsRead,
    sendTypingIndicator,
    stopTypingIndicator,
  } = useMessaging();

  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedConversation]);

  // Handle URL parameters to auto-select conversation
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId && conversations.length > 0) {
      const conversation = conversations.find((c) => c.id === conversationId);
      if (conversation && selectedConversation !== conversationId) {
        handleSelectConversation(conversationId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSelectConversation is stable, re-run on searchParams/conversations/selectedConversation
  }, [searchParams, conversations, selectedConversation]);

  // Auto-focus input when conversation is selected
  useEffect(() => {
    if (selectedConversation && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [selectedConversation]);

  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversation(conversationId);

    // Update URL without causing navigation
    setSearchParams({ conversation: conversationId }, { replace: true });

    await fetchMessages(conversationId);
    await markAsRead(conversationId);
  };

  const handleSendMessage = async (content: string) => {
    if (selectedConversation) {
      await sendMessage(selectedConversation, content);
      await stopTypingIndicator(selectedConversation);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    await addReaction(messageId, emoji);
  };

  const handleTyping = () => {
    if (selectedConversation) {
      sendTypingIndicator(selectedConversation);
    }
  };

  const handleStopTyping = () => {
    if (selectedConversation) {
      stopTypingIndicator(selectedConversation);
    }
  };

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;

    const title =
      conv.conversation_type === 'group'
        ? conv.title
        : conv.participants?.find((p) => p.user_id !== user?.id)?.profile?.display_name;

    return title?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const currentMessages = selectedConversation ? messages[selectedConversation] || [] : [];
  const currentTypingUsers = selectedConversation ? typingUsers[selectedConversation] || [] : [];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384 }}>
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p style={{ color: 'var(--muted-foreground)' }}>Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-200px)] md:h-[600px] overflow-hidden bg-background">
      {/* Conversation List - Full width on mobile, 1/3 on desktop */}
      <div
        className={`${selectedConversation ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 border-r flex-col`}
        style={{ backgroundColor: 'rgba(var(--background-rgb), 0.5)' }}
      >
        <div className="p-3 md:p-4 border-b">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h6 className="font-semibold text-lg md:text-base">Messages</h6>
            <Button size="sm" variant="outline" style={{ borderRadius: '50%', height: 36 }}>
              <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>

          <div className="relative">
            <Search
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                height: 16,
                width: 16,
                color: 'hsl(var(--muted-foreground))',
              }}
            />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 40, borderRadius: 50, height: 44 }}
            />
          </div>
        </div>

        <ScrollArea style={{ flex: 1 }}>
          <div className="p-3 md:p-4">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-8">
                <MessageCircle
                  style={{ height: 48, width: 48, color: 'hsl(var(--muted-foreground))', margin: '0 auto 16px' }}
                />
                <p style={{ color: 'var(--muted-foreground)' }}>No conversations yet</p>
              </div>
            ) : (
              <ConversationList
                conversations={filteredConversations}
                selectedConversation={selectedConversation}
                onSelectConversation={handleSelectConversation}
                currentUserId={user?.id || ''}
              />
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area - Full width on mobile when conversation selected */}
      <div
        className={`flex-1 flex-col ${selectedConversation ? 'flex' : 'hidden md:flex'}`}
      >
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div
              className="p-3 md:p-4 border-b"
              style={{
                backgroundColor: 'rgba(var(--background-rgb), 0.5)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Back button for mobile */}
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ height: 36, width: 36, padding: 0 }}
                    onClick={() => setSelectedConversation(null)}
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
                      <AvatarImage
                        src={
                          conversations
                            .find((c) => c.id === selectedConversation)
                            ?.participants?.find((p) => p.user_id !== user?.id)?.profile
                            ?.avatar_url || ''
                        }
                      />
                      <AvatarFallback>
                        {conversations
                          .find((c) => c.id === selectedConversation)
                          ?.participants?.find((p) => p.user_id !== user?.id)
                          ?.profile?.display_name?.charAt(0) || 'C'}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 12,
                        height: 12,
                        backgroundColor: 'hsl(var(--foreground))',
                        border: '2px solid var(--background)',
                        borderRadius: '50%',
                      }}
                    ></div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                      {conversations
                        .find((c) => c.id === selectedConversation)
                        ?.participants?.find((p) => p.user_id !== user?.id)?.profile
                        ?.display_name || 'Unknown User'}
                    </p>
                    <p className="text-sm text-foreground">
                      Online
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  style={{ borderRadius: '50%', height: 36, width: 36, padding: 0 }}
                >
                  <MoreVertical style={{ height: 16, width: 16 }} />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea
              style={{
                flex: 1,
                background:
                  'linear-gradient(to bottom, color-mix(in srgb, var(--background) 50%, transparent), var(--background))',
              }}
            >
              <div className="p-3 md:p-4">
                {currentMessages.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageCircle
                      style={{ height: 48, width: 48, color: 'hsl(var(--muted-foreground))', margin: '0 auto 16px' }}
                    />
                    <p style={{ color: 'var(--muted-foreground)' }}>
                      No messages yet. Start the conversation!
                    </p>
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
              onTyping={handleTyping}
              onStopTyping={handleStopTyping}
              disabled={sendingMessage}
              inputRef={inputRef}
            />
          </>
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
                style={{ height: 64, width: 64, color: 'hsl(var(--muted-foreground))', margin: '0 auto 16px' }}
              />
              <h6 className="text-lg font-medium mb-2">Select a conversation</h6>
              <p className="text-muted-foreground text-sm md:text-base">
                Choose a conversation from the list to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
