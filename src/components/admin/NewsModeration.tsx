import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Check, Eye, ExternalLink, Filter, RefreshCw, Search, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NewsArticle {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  url: string;
  image_url: string;
  author: string;
  published_at: string;
  created_at: string;
  category: string;
  sentiment: string;
  views_count: number;
  is_featured: boolean;
  news_sources: {
    name: string;
    source_type: string;
  };
}

export function NewsModeration() {
  const { toast } = useToast();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    category: "all",
    sentiment: "all",
    featured: "all"
  });
  const [stats, setStats] = useState({
    total: 0,
    featured: 0,
    categories: {} as Record<string, number>
  });
  const [cronStatus, setCronStatus] = useState<{
    jobname: string;
    schedule: string;
    active: boolean;
    jobid: number;
  } | null>(null);

  useEffect(() => {
    fetchArticles();
    fetchStats();
    fetchCronStatus();
  }, [filters]);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('news_articles')
        .select(`
          *,
          news_sources(name, source_type)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);
      }

      if (filters.category !== "all") {
        query = query.eq('category', filters.category);
      }

      if (filters.sentiment !== "all") {
        query = query.eq('sentiment', filters.sentiment);
      }

      if (filters.featured !== "all") {
        query = query.eq('is_featured', filters.featured === "true");
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching articles:', error);
        toast({
          title: "Error",
          description: "Failed to fetch articles",
          variant: "destructive"
        });
        return;
      }

      setArticles(data || []);
    } catch (error) {
      console.error('Error fetching articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { count: totalCount } = await supabase
        .from('news_articles')
        .select('id', { count: 'exact', head: true });

      const { count: featuredCount } = await supabase
        .from('news_articles')
        .select('id', { count: 'exact', head: true })
        .eq('is_featured', true);

      const { data: categoryData } = await supabase
        .from('news_articles')
        .select('category');

      const categories = {};
      categoryData?.forEach(article => {
        const cat = article.category || 'general';
        categories[cat] = (categories[cat] || 0) + 1;
      });

      setStats({
        total: totalCount || 0,
        featured: featuredCount || 0,
        categories
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const updateArticle = async (id: string, updates: Partial<NewsArticle>) => {
    try {
      const { error } = await supabase
        .from('news_articles')
        .update(updates)
        .eq('id', id);

      if (error) {
        throw error;
      }

      toast({
        title: "Success",
        description: "Article updated successfully"
      });

      fetchArticles();
      fetchStats();
    } catch (error) {
      console.error('Error updating article:', error);
      toast({
        title: "Error",
        description: "Failed to update article",
        variant: "destructive"
      });
    }
  };

  const deleteArticle = async (id: string) => {
    try {
      const { error } = await supabase
        .from('news_articles')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      toast({
        title: "Success",
        description: "Article deleted successfully"
      });

      fetchArticles();
      fetchStats();
      setSelectedArticle(null);
    } catch (error) {
      console.error('Error deleting article:', error);
      toast({
        title: "Error",
        description: "Failed to delete article",
        variant: "destructive"
      });
    }
  };

  const fetchCronStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('get_news_cron_status');
      
      if (error) {
        console.error('Error fetching cron status:', error);
        return;
      }

      if (data && data.length > 0) {
        setCronStatus(data[0]);
      }
    } catch (error) {
      console.error('Error fetching cron status:', error);
    }
  };

  const triggerNewsFetch = async () => {
    try {
      const { error } = await supabase.functions.invoke('fetch-news');
      
      if (error) {
        throw error;
      }

      toast({
        title: "Success",
        description: "News fetch triggered successfully"
      });

      setTimeout(() => {
        fetchArticles();
        fetchStats();
      }, 5000);
    } catch (error) {
      console.error('Error triggering news fetch:', error);
      toast({
        title: "Error",
        description: "Failed to trigger news fetch",
        variant: "destructive"
      });
    }
  };

  const getSentimentBadge = (sentiment: string) => {
    if (!sentiment) return <Badge variant="secondary">Unknown</Badge>;
    
    switch (sentiment.toLowerCase()) {
      case 'positive':
        return <Badge className="bg-green-500">Positive</Badge>;
      case 'negative':
        return <Badge className="bg-red-500">Negative</Badge>;
      default:
        return <Badge variant="secondary">Neutral</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">News Moderation</h2>
          <p className="text-muted-foreground">Manage and moderate news articles</p>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={triggerNewsFetch}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Fetch Latest News
          </Button>
          
          {cronStatus && (
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${cronStatus.active ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-muted-foreground">
                Auto-fetch: {cronStatus.active ? 'Active' : 'Inactive'} ({cronStatus.schedule})
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Featured Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.featured}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(stats.categories).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Latest Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{articles.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search articles..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={filters.category} onValueChange={(value) => setFilters(prev => ({ ...prev, category: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="politics">Politics</SelectItem>
                  <SelectItem value="entertainment">Entertainment</SelectItem>
                  <SelectItem value="sports">Sports</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="health">Health</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sentiment</Label>
              <Select value={filters.sentiment} onValueChange={(value) => setFilters(prev => ({ ...prev, sentiment: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sentiments</SelectItem>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Featured</Label>
              <Select value={filters.featured} onValueChange={(value) => setFilters(prev => ({ ...prev, featured: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Articles</SelectItem>
                  <SelectItem value="true">Featured Only</SelectItem>
                  <SelectItem value="false">Non-Featured</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Articles List */}
      <Card>
        <CardHeader>
          <CardTitle>Articles</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading articles...</div>
          ) : articles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No articles found</div>
          ) : (
            <div className="space-y-4">
              {articles.map((article) => (
                <div key={article.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold line-clamp-1">{article.title}</h3>
                        {article.is_featured && <Badge>Featured</Badge>}
                        {getSentimentBadge(article.sentiment)}
                      </div>
                      
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {article.excerpt}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>By {article.author || 'Unknown'}</span>
                        <span>•</span>
                        <span>{article.news_sources?.name}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(article.published_at))} ago</span>
                        <span>•</span>
                        <span>{article.views_count} views</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedArticle(article)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant={article.is_featured ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateArticle(article.id, { is_featured: !article.is_featured })}
                      >
                        {article.is_featured ? "Unfeature" : "Feature"}
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(article.url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Article Detail Dialog */}
      <Dialog open={!!selectedArticle} onOpenChange={() => setSelectedArticle(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Article Details</DialogTitle>
          </DialogHeader>
          
          {selectedArticle && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Title</Label>
                  <Input 
                    value={selectedArticle.title} 
                    onChange={(e) => setSelectedArticle({...selectedArticle, title: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select 
                    value={selectedArticle.category} 
                    onValueChange={(value) => setSelectedArticle({...selectedArticle, category: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="politics">Politics</SelectItem>
                      <SelectItem value="entertainment">Entertainment</SelectItem>
                      <SelectItem value="sports">Sports</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="health">Health</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Excerpt</Label>
                <Textarea 
                  value={selectedArticle.excerpt || ''} 
                  onChange={(e) => setSelectedArticle({...selectedArticle, excerpt: e.target.value})}
                  rows={3}
                />
              </div>

              <div>
                <Label>Content Preview</Label>
                <div className="border rounded-lg p-4 max-h-60 overflow-y-auto bg-muted/50">
                  <p className="text-sm whitespace-pre-wrap">
                    {selectedArticle.content.substring(0, 1000)}
                    {selectedArticle.content.length > 1000 && '...'}
                  </p>
                </div>
              </div>

              {selectedArticle.image_url && (
                <div>
                  <Label>Article Image</Label>
                  <img 
                    src={selectedArticle.image_url} 
                    alt={selectedArticle.title}
                    className="w-full max-w-md rounded-lg border"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Button
                    variant={selectedArticle.is_featured ? "default" : "outline"}
                    onClick={() => {
                      const updated = { ...selectedArticle, is_featured: !selectedArticle.is_featured };
                      setSelectedArticle(updated);
                      updateArticle(selectedArticle.id, { is_featured: !selectedArticle.is_featured });
                    }}
                  >
                    {selectedArticle.is_featured ? "Unfeature" : "Feature"}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => window.open(selectedArticle.url, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Original
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      updateArticle(selectedArticle.id, {
                        title: selectedArticle.title,
                        category: selectedArticle.category,
                        excerpt: selectedArticle.excerpt
                      });
                    }}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this article?')) {
                        deleteArticle(selectedArticle.id);
                      }
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}