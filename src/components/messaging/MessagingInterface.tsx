import React, { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Eye
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMessaging, type Conversation, type Message, type TypingIndicator } from "@/hooks/useMessaging";
import { useAuth } from "@/hooks/useAuth";
import { UserModeBadge } from "@/components/profile/UserModeBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSearchParams } from "react-router-dom";

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  onReaction: (messageId: string, emoji: string) => void;
}

const MessageStatusIcon = ({ status }: { status?: Message['status'] }) => {
  switch (status) {
    case 'sending':
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case 'sent':
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'read':
      return <Eye className="h-3 w-3 text-primary" />;
    default:
      return null;
  }
};

const MessageItem = ({ message, isOwn, onReaction }: MessageItemProps) => {
  const [showReactions, setShowReactions] = useState(false);

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😠'];

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4 group animate-in slide-in-from-bottom-2 duration-300`}>
      <div className={`max-w-[70%] ${isOwn ? 'order-2' : 'order-1'}`}>
        {!isOwn && (
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="h-6 w-6">
              <AvatarImage src={message.sender?.avatar_url || ''} />
              <AvatarFallback>
                {message.sender?.display_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">
              {message.sender?.display_name || 'Unknown User'}
            </span>
          </div>
        )}
        
        <div className="relative">
          <div
            className={`px-4 py-2 rounded-2xl ${
              isOwn
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-muted rounded-bl-md'
            } ${message.status === 'sending' ? 'opacity-60' : ''}`}
          >
            <p className="text-sm">{message.content}</p>
          </div>
          
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
              </span>
              
              {isOwn && <MessageStatusIcon status={message.status} />}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setShowReactions(!showReactions)}
            >
              <Smile className="h-3 w-3" />
            </Button>
          </div>

          {showReactions && (
            <div className="absolute top-full mt-1 bg-popover border rounded-lg p-2 shadow-md z-10 animate-in fade-in duration-200">
              <div className="flex gap-1">
                {commonEmojis.map(emoji => (
                  <Button
                    key={emoji}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-muted transition-colors"
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
            <div className="flex flex-wrap gap-1 mt-2">
              {message.reactions.map(reaction => (
                <Badge key={reaction.id} variant="secondary" className="text-xs animate-in zoom-in duration-200">
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

const TypingIndicator = ({ typingUsers }: TypingIndicatorProps) => {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map(user => user.display_name).join(', ');
  const verb = typingUsers.length === 1 ? 'is' : 'are';
  
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground animate-in slide-in-from-bottom-2 duration-300">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-xs">
          {typingUsers[0]?.display_name?.charAt(0) || 'U'}
        </AvatarFallback>
      </Avatar>
      <span>{names} {verb} typing</span>
      <div className="flex gap-1">
        <div className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-1 h-1 bg-primary rounded-full animate-bounce"></div>
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
  currentUserId 
}: ConversationListProps) => {
  const getConversationTitle = (conversation: Conversation) => {
    if (conversation.conversation_type === 'group') {
      return conversation.title || 'Group Chat';
    }
    
    // For direct messages, show the other participant's name
    const otherParticipant = conversation.participants?.find(
      p => p.user_id !== currentUserId
    );
    return otherParticipant?.profile?.display_name || 'Unknown User';
  };

  const getConversationAvatar = (conversation: Conversation) => {
    if (conversation.conversation_type === 'group') {
      return null; // Could show group avatar
    }
    
    const otherParticipant = conversation.participants?.find(
      p => p.user_id !== currentUserId
    );
    return otherParticipant?.profile?.avatar_url;
  };

  const getOtherParticipant = (conversation: Conversation) => {
    if (conversation.conversation_type === 'group') {
      return null;
    }
    
    return conversation.participants?.find(
      p => p.user_id !== currentUserId
    );
  };

  return (
    <div className="space-y-2">
      {conversations.map(conversation => (
        <Card
          key={conversation.id}
          className={`cursor-pointer transition-all duration-200 hover:bg-muted/50 hover:shadow-sm ${
            selectedConversation === conversation.id ? 'ring-2 ring-primary border-primary' : ''
          }`}
          onClick={() => onSelectConversation(conversation.id)}
        >
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-3 min-h-[48px]">
              <Avatar>
                <AvatarImage src={getConversationAvatar(conversation) || ''} />
                <AvatarFallback>
                  {getConversationTitle(conversation).charAt(0)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">
                      {getConversationTitle(conversation)}
                    </h4>
                    {getOtherParticipant(conversation)?.profile?.user_mode && (
                      <UserModeBadge 
                        mode={getOtherParticipant(conversation)?.profile?.user_mode || ''} 
                        size="sm" 
                      />
                    )}
                  </div>
                  {conversation.last_message_at && (
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
                
                {conversation.last_message && (
                  <p className="text-sm text-muted-foreground truncate">
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

const MessageInput = ({ onSend, onTyping, onStopTyping, disabled, inputRef }: MessageInputProps) => {
  const [message, setMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Common emojis for quick access
  const commonEmojis = [
    '😀', '😂', '🥰', '😍', '🤔', '👍', '👎', '❤️', '🔥', '💯',
    '😊', '😎', '🙄', '😴', '🤗', '👋', '👏', '🎉', '💪', '🙏',
    '😢', '😭', '😡', '😱', '🤯', '🥺', '😤', '🤮', '😷', '🤒'
  ];

  // Add emoji to message
  const addEmoji = (emoji: string) => {
    setMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef?.current?.focus();
  };

  // Sanitize message input to prevent XSS
  const sanitizeMessage = (input: string): string => {
    return DOMPurify.sanitize(input, { 
      ALLOWED_TAGS: [], 
      ALLOWED_ATTR: [] 
    }).trim();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedMessage = sanitizeMessage(message);
    if (sanitizedMessage && !disabled) {
      onSend(sanitizedMessage);
      setMessage("");
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
      handleSubmit(e as any);
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
    <form onSubmit={handleSubmit} className="flex gap-2 p-3 md:p-4 border-t bg-background/50 backdrop-blur">
      <Input
        ref={inputRef}
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        className="flex-1 rounded-full border-muted-foreground/20 focus:border-primary transition-colors h-11 md:h-10"
        maxLength={2000}
      />
      
      {/* Emoji Picker */}
      <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
        <PopoverTrigger asChild>
          <Button 
            type="button"
            variant="ghost" 
            size="sm"
            className="rounded-full h-11 w-11 md:h-10 md:w-10 p-0"
            disabled={disabled}
          >
            <Smile className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" side="top">
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Choose an emoji</h4>
            <div className="grid grid-cols-8 md:grid-cols-10 gap-1">
              {commonEmojis.map((emoji, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 md:h-8 md:w-8 p-0 hover:bg-muted transition-colors"
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
        className="rounded-full h-11 w-11 md:h-10 md:w-10 p-0 transition-all hover:scale-105"
        size="sm"
      >
        <Send className="h-5 w-5 md:h-4 md:w-4" />
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
    stopTypingIndicator
  } = useMessaging();

  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedConversation]);

  // Handle URL parameters to auto-select conversation
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId && conversations.length > 0) {
      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation && selectedConversation !== conversationId) {
        handleSelectConversation(conversationId);
      }
    }
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

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    
    const title = conv.conversation_type === 'group' 
      ? conv.title 
      : conv.participants?.find(p => p.user_id !== user?.id)?.profile?.display_name;
    
    return title?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const currentMessages = selectedConversation ? messages[selectedConversation] || [] : [];
  const currentTypingUsers = selectedConversation ? typingUsers[selectedConversation] || [] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-200px)] md:h-[600px] overflow-hidden rounded-lg border bg-background">
      {/* Conversation List - Full width on mobile, 1/3 on desktop */}
      <div className={`${selectedConversation ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 border-r bg-background/50 flex-col`}>
        <div className="p-3 md:p-4 border-b">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h2 className="font-semibold text-lg md:text-base">Messages</h2>
            <Button size="sm" variant="outline" className="rounded-full h-9 md:h-8">
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-full border-muted-foreground/20 h-11 md:h-10"
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-3 md:p-4">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-8">
                <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
      <div className={`${selectedConversation ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-3 md:p-4 border-b bg-background/50 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Back button for mobile */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="md:hidden h-9 w-9 p-0"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </Button>
                  
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={
                        conversations.find(c => c.id === selectedConversation)?.participants
                          ?.find(p => p.user_id !== user?.id)?.profile?.avatar_url || ''
                      } />
                      <AvatarFallback>
                        {conversations.find(c => c.id === selectedConversation)?.participants
                          ?.find(p => p.user_id !== user?.id)?.profile?.display_name?.charAt(0) || 'C'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-background rounded-full"></div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium truncate">
                      {conversations.find(c => c.id === selectedConversation)?.participants
                        ?.find(p => p.user_id !== user?.id)?.profile?.display_name || 'Unknown User'}
                    </h3>
                    <p className="text-sm text-green-600">Online</p>
                  </div>
                </div>
                
                <Button variant="ghost" size="sm" className="rounded-full h-9 w-9 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 bg-gradient-to-b from-background/50 to-background">
              <div className="p-3 md:p-4">
                {currentMessages.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  <div>
                    {currentMessages.map(message => (
                      <MessageItem
                        key={message.id}
                        message={message}
                        isOwn={message.sender_id === user?.id}
                        onReaction={handleReaction}
                      />
                    ))}
                    
                    <TypingIndicator typingUsers={currentTypingUsers} />
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
          <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-background/50 to-background">
            <div className="text-center px-4">
              <MessageCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Select a conversation</h3>
              <p className="text-muted-foreground text-sm md:text-base">Choose a conversation from the list to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};