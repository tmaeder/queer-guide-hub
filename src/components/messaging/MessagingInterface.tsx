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
              className="rounded-container shadow-[var(--shadow-aceternity-sm)] border border-border absolute mt-1 p-2"
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
          <CardContent className="p-3">
            <div style={{ alignItems: 'center', minHeight: 48 }} className="flex gap-3">
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
        borderTop: '1px solid var(--border)',
        backgroundColor: 'color-mix(in srgb, var(--background) 50%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
      className="flex gap-2 p-3"
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
          <div className="flex flex-col gap-3">
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
      <div style={{ alignItems: 'center', justifyContent: 'center', height: 384 }} className="flex">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading messages...</p>
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
            <Button size="sm" variant="outline" className="rounded-element" style={{ height: 36 }}>
              <Plus size={16} className="mr-2" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>

          <div className="relative">
            <Search
              style={{ left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16 }}
              className="absolute text-muted-foreground"
            />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-element"
              style={{ paddingLeft: 40, height: 44 }}
            />
          </div>
        </div>

        <ScrollArea style={{ flex: 1 }}>
          <div className="p-3 md:p-4">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-8">
                <MessageCircle
                  size={48}
                  style={{ margin: '0 auto 16px' }}
                  className="text-muted-foreground"
                />
                <p className="text-muted-foreground">No conversations yet</p>
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
      <div className={`flex-1 flex-col ${selectedConversation ? 'flex' : 'hidden md:flex'}`}>
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
                    style={{ height: 36, width: 36 }}
                    className="p-0"
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
                      {conversations
                        .find((c) => c.id === selectedConversation)
                        ?.participants?.find((p) => p.user_id !== user?.id)?.profile
                        ?.display_name || 'Unknown User'}
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
                      size={48}
                      style={{ margin: '0 auto 16px' }}
                      className="text-muted-foreground"
                    />
                    <p className="text-muted-foreground">
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
                size={64}
                style={{ margin: '0 auto 16px' }}
                className="text-muted-foreground"
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
