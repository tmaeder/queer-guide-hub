import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  MessageCircle, 
  Search, 
  Brain, 
  Loader2, 
  Send, 
  Trash2, 
  Database,
  MapPin,
  Calendar,
  Tag,
  Users,
  ShoppingBag,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { useRAGKnowledgeBase } from '@/hooks/useRAGKnowledgeBase';
import { useToast } from '@/hooks/use-toast';

interface RAGKnowledgeBaseProps {
  defaultContentTypes?: string[];
  placeholder?: string;
  showHistory?: boolean;
}

const contentTypeIcons = {
  venue: MapPin,
  event: Calendar,
  tag: Tag,
  group: Users,
  marketplace: ShoppingBag
};

const contentTypeColors = {
  venue: 'bg-blue-500',
  event: 'bg-purple-500', 
  tag: 'bg-green-500',
  group: 'bg-orange-500',
  marketplace: 'bg-pink-500'
};

export function RAGKnowledgeBase({ 
  defaultContentTypes = ['venue', 'event', 'tag', 'group', 'marketplace'],
  placeholder = "Ask me anything about venues, events, tags, groups, or marketplace items...",
  showHistory = true 
}: RAGKnowledgeBaseProps) {
  const [query, setQuery] = useState('');
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>(defaultContentTypes);
  const [currentResponse, setCurrentResponse] = useState<any>(null);
  const [isPopulating, setIsPopulating] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const {
    isLoading,
    conversations,
    askQuestion,
    populateEmbeddings,
    clearConversationHistory
  } = useRAGKnowledgeBase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    try {
      const response = await askQuestion(query, selectedContentTypes, 5);
      if (response) {
        setCurrentResponse(response);
        setQuery('');
        
        // Scroll to top to show new response
        setTimeout(() => {
          scrollAreaRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePopulateEmbeddings = async () => {
    setIsPopulating(true);
    try {
      const result = await populateEmbeddings(selectedContentTypes, false);
      toast({
        title: "Embeddings populated",
        description: `Processed ${result.total_processed} items with ${result.total_errors} errors.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to populate embeddings.",
        variant: "destructive",
      });
    } finally {
      setIsPopulating(false);
    }
  };

  const toggleContentType = (type: string) => {
    setSelectedContentTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const renderContext = (context: any[]) => {
    if (!context?.length) return null;

    return (
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Search className="h-4 w-4" />
          Sources Found ({context.length})
        </h4>
        {context.map((item, index) => {
          const Icon = contentTypeIcons[item.content_type as keyof typeof contentTypeIcons] || Tag;
          const colorClass = contentTypeColors[item.content_type as keyof typeof contentTypeColors] || 'bg-gray-500';
          
          return (
            <Card key={index} className="border border-muted">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full ${colorClass} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        {item.content_type}
                      </Badge>
                      {item.similarity && (
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(item.similarity * 100)}% match
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {item.content_text}
                    </p>
                    
                    {/* Show additional details based on content type */}
                    {item.venue_details && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <strong>{item.venue_details.name}</strong> • {item.venue_details.type} • {item.venue_details.city}
                      </div>
                    )}
                    {item.event_details && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <strong>{item.event_details.title}</strong> • {item.event_details.event_type} • {item.event_details.city}
                      </div>
                    )}
                    {item.tag_details && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <strong>{item.tag_details.name}</strong> • {item.tag_details.category}
                      </div>
                    )}
                    {item.group_details && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <strong>{item.group_details.name}</strong> • {item.group_details.member_count} members
                      </div>
                    )}
                    {item.listing_details && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <strong>{item.listing_details.title}</strong> • {item.listing_details.condition}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI Knowledge Base
            <Sparkles className="h-4 w-4 text-yellow-500" />
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Ask questions about venues, events, tags, groups, and marketplace items. The AI will search through our database and provide intelligent answers based on relevant content.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Content Type Filters */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Search in:</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(contentTypeIcons).map(([type, Icon]) => (
                <Button
                  key={type}
                  variant={selectedContentTypes.includes(type) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleContentType(type)}
                  className="h-8"
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {/* Query Input */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              disabled={isLoading}
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={isLoading || !query.trim()}
              size="default"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>

          {/* Management Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePopulateEmbeddings}
              disabled={isPopulating}
            >
              {isPopulating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Database className="h-3 w-3 mr-1" />
              )}
              Populate Embeddings
            </Button>
            
            {showHistory && conversations.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearConversationHistory}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear History
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current Response */}
      {currentResponse && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              AI Response
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap">{currentResponse.response}</p>
            </div>
            
            {currentResponse.context?.length > 0 && (
              <>
                <Separator />
                {renderContext(currentResponse.context)}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Conversation History */}
      {showHistory && conversations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea ref={scrollAreaRef} className="h-96">
              <div className="space-y-4">
                {conversations.map((conversation) => (
                  <div key={conversation.id} className="border-l-2 border-muted pl-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-1">You</Badge>
                      <p className="text-sm font-medium">{conversation.query}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary" className="mt-1">AI</Badge>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {conversation.response}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(conversation.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}