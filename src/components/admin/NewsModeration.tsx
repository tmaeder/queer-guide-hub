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
    featured: "all"
  });
  const [stats, setStats] = useState({
    total: 0,
    featured: 0
  });
  const [cronStatus, setCronStatus] = useState<{
    job_name: string;
    last_run: string;
    next_run: string;
    status: string;
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

      setStats({
        total: totalCount || 0,
        featured: featuredCount || 0
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


  return (
    <div sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header & Stats */}
      <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 sx={{ fontSize: '1.5rem', fontWeight: 700 }}>News Moderation</h2>
          <p style={{ color: 'var(--muted-foreground)' }}>Manage and moderate news articles</p>
        </div>
        <div sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button onClick={triggerNewsFetch}>
            <RefreshCw style={{ height: 16, width: 16, marginRight: 8 }} />
            Fetch Latest News
          </Button>
          
          {cronStatus && (
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: 8, backgroundColor: cronStatus.status === 'active' ? 'var(--success)' : 'var(--destructive)' }}></div>
              <span style={{ color: 'var(--muted-foreground)' }}>
                Auto-fetch: {cronStatus.status} (Last: {new Date(cronStatus.last_run).toLocaleString()})
              </span>
            </div>
          )}
        </div>
      </div>

      <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        <Card>
          <CardHeader sx={{ pb: 1.5 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Total Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader sx={{ pb: 1.5 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Featured Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.featured}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader sx={{ pb: 1.5 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Latest Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{articles.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Filter style={{ height: 16, width: 16 }} />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <div>
              <Label>Search</Label>
              <div sx={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 12, top: 12, height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <Input
                  placeholder="Search articles..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  sx={{ pl: 4.5 }}
                />
              </div>
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
            <div sx={{ textAlign: 'center', py: 4 }}>Loading articles...</div>
          ) : articles.length === 0 ? (
            <div sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>No articles found</div>
          ) : (
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {articles.map((article) => (
                <div key={article.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                  <div sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <h3 sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{article.title}</h3>
                        {article.is_featured && <Badge>Featured</Badge>}
                      </div>
                      
                      <p sx={{ fontSize: '0.875rem', color: 'text.secondary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {article.excerpt}
                      </p>
                      
                      <div sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
                        <span>By {article.author || 'Unknown'}</span>
                        <span>•</span>
                        <span>{article.news_sources?.name}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(article.published_at))} ago</span>
                        <span>•</span>
                        <span>{article.views_count} views</span>
                      </div>
                    </div>
                    
                    <div sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedArticle(article)}
                      >
                        <Eye style={{ height: 16, width: 16 }} />
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
                        <ExternalLink style={{ height: 16, width: 16 }} />
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
        <DialogContent sx={{ maxWidth: 896, maxHeight: '80vh', overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle>Article Details</DialogTitle>
          </DialogHeader>
          
          {selectedArticle && (
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div>
                <Label>Title</Label>
                <Input 
                  value={selectedArticle.title} 
                  onChange={(e) => setSelectedArticle({...selectedArticle, title: e.target.value})}
                />
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
                <div sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, maxHeight: 240, overflowY: 'auto', bgcolor: 'action.hover' }}>
                  <p sx={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
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
                    sx={{ width: '100%', maxWidth: 448, borderRadius: 2, border: 1, borderColor: 'divider' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                    <ExternalLink style={{ height: 16, width: 16, marginRight: 8 }} />
                    View Original
                  </Button>
                </div>

                <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    onClick={() => {
                      updateArticle(selectedArticle.id, {
                        title: selectedArticle.title,
                        excerpt: selectedArticle.excerpt
                      });
                    }}
                  >
                    <Check style={{ height: 16, width: 16, marginRight: 8 }} />
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
                    <X style={{ height: 16, width: 16, marginRight: 8 }} />
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