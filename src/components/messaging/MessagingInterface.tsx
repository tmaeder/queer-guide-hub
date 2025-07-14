import React, { useState, useRef, useEffect } from "react";
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
  Smile
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMessaging, type Conversation, type Message } from "@/hooks/useMessaging";
import { useAuth } from "@/hooks/useAuth";

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  onReaction: (messageId: string, emoji: string) => void;
}

const MessageItem = ({ message, isOwn, onReaction }: MessageItemProps) => {
  const [showReactions, setShowReactions] = useState(false);

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😠'];

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4 group`}>
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
            className={`px-4 py-2 ${
              isOwn
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted'
            }`}
          >
            <p className="text-sm">{message.content}</p>
          </div>
          
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </span>
            
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
            <div className="absolute top-full mt-1 bg-popover p-2 shadow-md z-10">
              <div className="flex gap-1">
                {commonEmojis.map(emoji => (
                  <Button
                    key={emoji}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
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

  return (
    <div className="space-y-2">
      {conversations.map(conversation => (
        <Card
          key={conversation.id}
          className={`cursor-pointer transition-colors hover:bg-muted/50 ${
            selectedConversation === conversation.id ? 'border-primary' : ''
          }`}
          onClick={() => onSelectConversation(conversation.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={getConversationAvatar(conversation) || ''} />
                <AvatarFallback>
                  {getConversationTitle(conversation).charAt(0)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium truncate">
                    {getConversationTitle(conversation)}
                  </h4>
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
  disabled?: boolean;
}

const MessageInput = ({ onSend, disabled }: MessageInputProps) => {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-4">
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type a message..."
        disabled={disabled}
        className="flex-1"
      />
      <Button type="submit" disabled={disabled || !message.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
};

export const MessagingInterface = () => {
  const { user } = useAuth();
  const {
    conversations,
    messages,
    loading,
    sendingMessage,
    fetchMessages,
    sendMessage,
    addReaction,
    markAsRead
  } = useMessaging();

  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedConversation]);

  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversation(conversationId);
    await fetchMessages(conversationId);
    await markAsRead(conversationId);
  };

  const handleSendMessage = async (content: string) => {
    if (selectedConversation) {
      await sendMessage(selectedConversation, content);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    await addReaction(messageId, emoji);
  };

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    
    const title = conv.conversation_type === 'group' 
      ? conv.title 
      : conv.participants?.find(p => p.user_id !== user?.id)?.profile?.display_name;
    
    return title?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const currentMessages = selectedConversation ? messages[selectedConversation] || [] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 bg-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[600px] overflow-hidden">
      {/* Conversation List */}
      <div className="w-1/3 bg-background">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Messages</h2>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              New
            </Button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        <ScrollArea className="h-[calc(100%-140px)]">
          <div className="p-4">
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

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {conversations.find(c => c.id === selectedConversation)?.participants
                        ?.find(p => p.user_id !== user?.id)?.profile?.display_name?.charAt(0) || 'C'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-medium">
                      {conversations.find(c => c.id === selectedConversation)?.participants
                        ?.find(p => p.user_id !== user?.id)?.profile?.display_name || 'Unknown User'}
                    </h3>
                    <p className="text-sm text-muted-foreground">Online</p>
                  </div>
                </div>
                
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
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
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Message Input */}
            <MessageInput
              onSend={handleSendMessage}
              disabled={sendingMessage}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Select a conversation</h3>
              <p className="text-muted-foreground">Choose a conversation from the list to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};