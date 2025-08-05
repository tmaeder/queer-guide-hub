import React, { useState, useEffect } from 'react';
import { InteractiveRAGGraph } from '@/components/knowledge/InteractiveRAGGraph';
import { RAGKnowledgeBase } from '@/components/knowledge/RAGKnowledgeBase';
import { useRAGGraphData } from '@/hooks/useRAGGraphData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Brain, 
  Network, 
  Search, 
  MessageCircle, 
  Loader2,
  Database,
  Zap,
  Eye,
  BarChart3,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function KnowledgeBase() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>([
    'venue', 'event', 'tag', 'group', 'marketplace'
  ]);
  const [activeTab, setActiveTab] = useState('chat');
  const [isPopulating, setIsPopulating] = useState(false);
  const [embeddingsCount, setEmbeddingsCount] = useState<number | null>(null);
  const { toast } = useToast();

  const {
    nodes,
    connections,
    isLoading,
    error,
    fetchGraphData,
    searchSimilarContent,
    getNodeDetails
  } = useRAGGraphData();

  useEffect(() => {
    // Load initial graph data and check embeddings count
    fetchGraphData();
    checkEmbeddingsCount();
  }, []);

  const checkEmbeddingsCount = async () => {
    try {
      const { data, error } = await supabase
        .from('content_embeddings')
        .select('id', { count: 'exact' });
      
      if (error) throw error;
      setEmbeddingsCount(data?.length || 0);
    } catch (error) {
      console.error('Error checking embeddings count:', error);
    }
  };

  const populateEmbeddings = async () => {
    setIsPopulating(true);
    try {
      const { data, error } = await supabase.functions.invoke('populate-embeddings', {
        body: {
          content_types: selectedContentTypes,
          force_refresh: false
        }
      });

      if (error) throw error;

      toast({
        title: "Embeddings populated successfully!",
        description: `Processed ${data.total_processed} items. The knowledge graph is now connected to real data.`,
      });

      // Refresh the embeddings count and graph data
      await checkEmbeddingsCount();
      await fetchGraphData();
      setActiveTab('graph');
    } catch (error) {
      console.error('Error populating embeddings:', error);
      toast({
        title: "Failed to populate embeddings",
        description: error.message || "An error occurred while processing your content.",
        variant: "destructive",
      });
    } finally {
      setIsPopulating(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Enter a search query",
        description: "Please enter a search query to explore the knowledge graph.",
        variant: "destructive",
      });
      return;
    }

    try {
      await fetchGraphData(searchQuery, selectedContentTypes);
      setActiveTab('graph');
      toast({
        title: "Graph updated",
        description: `Found ${nodes.length} related items for "${searchQuery}".`,
      });
    } catch (error) {
      toast({
        title: "Search failed",
        description: "Failed to update the graph. Please try again.",
        variant: "destructive",
      });
    }
  };

  const toggleContentType = (type: string) => {
    const newTypes = selectedContentTypes.includes(type)
      ? selectedContentTypes.filter(t => t !== type)
      : [...selectedContentTypes, type];
    setSelectedContentTypes(newTypes);
  };

  const contentTypeIcons = {
    venue: '🏢',
    event: '🎉', 
    tag: '🏷️',
    group: '👥',
    marketplace: '🛍️'
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Brain className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">AI Knowledge Base</h1>
          <Network className="h-8 w-8 text-purple-500" />
        </div>
        <p className="text-xl text-muted-foreground max-w-4xl mx-auto">
          Explore the interconnected world of LGBTQ+ content through an intelligent knowledge graph. 
          Chat with AI or visualize relationships in an interactive 3D space.
        </p>
      </div>

      {/* Search Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Knowledge Explorer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Content Type Filters */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Content Types:</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(contentTypeIcons).map(([type, icon]) => (
                <Button
                  key={type}
                  variant={selectedContentTypes.includes(type) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleContentType(type)}
                  className="h-8"
                >
                  <span className="mr-1">{icon}</span>
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter a query to explore connections (e.g., 'LGBTQ+ venues in Berlin')"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Explore
            </Button>
          </div>

          {/* Stats */}
          {nodes.length > 0 && (
            <div className="flex gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Database className="h-4 w-4" />
                {nodes.length} nodes
              </div>
              <div className="flex items-center gap-1">
                <Network className="h-4 w-4" />
                {connections.length} connections
              </div>
              {searchQuery && (
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  Query: "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Status Panel */}
      <Card className={embeddingsCount === 0 ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20" : "border-green-500 bg-green-50 dark:bg-green-950/20"}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Database className={`h-5 w-5 ${embeddingsCount === 0 ? 'text-orange-500' : 'text-green-500'}`} />
              Knowledge Base Status
            </span>
            <Button 
              onClick={checkEmbeddingsCount} 
              variant="ghost" 
              size="sm"
              disabled={isPopulating}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              {embeddingsCount === null ? (
                <p className="text-sm text-muted-foreground">Checking embeddings status...</p>
              ) : embeddingsCount === 0 ? (
                <>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                      No embeddings found - Please populate embeddings first
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click "Populate Knowledge Base" to connect the graph to your real database content
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">
                      {embeddingsCount} embeddings ready
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Knowledge graph is connected to real database content
                  </p>
                </>
              )}
            </div>
            {embeddingsCount === 0 && (
              <Button 
                onClick={populateEmbeddings} 
                disabled={isPopulating}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {isPopulating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Populating...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Populate Knowledge Base
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Main Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            AI Chat
          </TabsTrigger>
          <TabsTrigger value="graph" className="flex items-center gap-2">
            <Network className="h-4 w-4" />
            3D Graph
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="space-y-4">
          <RAGKnowledgeBase 
            defaultContentTypes={selectedContentTypes}
            placeholder="Ask me anything about the knowledge graph..."
            showHistory={true}
          />
        </TabsContent>

        <TabsContent value="graph" className="space-y-4">
          {nodes.length > 0 ? (
            <InteractiveRAGGraph 
              ragData={nodes} 
              initialQuery={searchQuery}
            />
          ) : (
            <Card className="h-[600px] flex items-center justify-center">
              <CardContent className="text-center">
                <Network className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Graph Data</h3>
                <p className="text-muted-foreground mb-4">
                  Enter a search query above to generate an interactive knowledge graph
                </p>
                <Button onClick={() => fetchGraphData()} variant="outline">
                  <Database className="h-4 w-4 mr-2" />
                  Populate Real Data
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="h-5 w-5 text-blue-500" />
                  Content Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(
                    nodes.reduce((acc, node) => {
                      acc[node.content_type] = (acc[node.content_type] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([type, count]) => (
                    <div key={type} className="flex justify-between items-center">
                      <span className="text-sm flex items-center gap-1">
                        <span>{contentTypeIcons[type as keyof typeof contentTypeIcons]}</span>
                        {type}
                      </span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Network className="h-5 w-5 text-purple-500" />
                  Connections
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Total Connections</span>
                    <Badge>{connections.length}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Avg. Connections/Node</span>
                    <Badge variant="outline">
                      {nodes.length > 0 ? (connections.length * 2 / nodes.length).toFixed(1) : 0}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Graph Density</span>
                    <Badge variant="outline">
                      {nodes.length > 1 
                        ? ((connections.length / (nodes.length * (nodes.length - 1) / 2)) * 100).toFixed(1) + '%'
                        : '0%'
                      }
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Quality Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Avg. Similarity</span>
                    <Badge variant="secondary">
                      {nodes.length > 0 
                        ? Math.round(nodes.reduce((acc, n) => acc + (n.similarity || 0), 0) / nodes.length * 100) + '%'
                        : '0%'
                      }
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">High Quality Nodes</span>
                    <Badge variant="outline">
                      {nodes.filter(n => (n.similarity || 0) > 0.7).length}
                    </Badge>
                  </div>
                  {searchQuery && (
                    <div className="flex justify-between">
                      <span className="text-sm">Query Relevance</span>
                      <Badge>
                        {Math.round(nodes.reduce((acc, n) => acc + (n.similarity || 0), 0) / Math.max(nodes.length, 1) * 100)}%
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Relationship Types */}
          {connections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Relationship Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(
                    connections.reduce((acc, conn) => {
                      acc[conn.relationship_type] = (acc[conn.relationship_type] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([type, count]) => (
                    <div key={type} className="text-center p-3 border rounded">
                      <div className="text-lg font-semibold">{count}</div>
                      <div className="text-sm text-muted-foreground capitalize">{type}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}