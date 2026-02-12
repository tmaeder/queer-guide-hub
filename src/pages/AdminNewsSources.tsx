import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { 
  Plus, 
  Edit, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  Globe, 
  Rss, 
  Activity,
  Calendar,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Settings,
  Tags
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface NewsSource {
  id: string;
  name: string;
  url: string;
  source_type: 'rss' | 'api';
  category: string;
  is_active: boolean;
  fetch_frequency: number;
  status?: string;
  last_error?: string;
  articles_fetched?: number;
  keywords?: string[];
  created_at: string;
  updated_at: string;
  last_fetched_at?: string;
}

export default function AdminNewsSources() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isModerator, canManageContent, loading } = useAdminRoles();
  const { toast } = useToast();
  
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [keywordsDialogOpen, setKeywordsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<NewsSource | null>(null);
  const [editingKeywords, setEditingKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    source_type: 'rss' as 'rss' | 'api',
    category: 'general',
    is_active: true,
    fetch_frequency: 24
  });

  const categories = [
    'general', 'rights', 'politics', 'health', 'community', 
    'business', 'sports', 'entertainment', 'technology'
  ];

  const frequencies = [
    { value: 1, label: 'Every Hour' },
    { value: 24, label: 'Daily' },
    { value: 168, label: 'Weekly' },
    { value: 0, label: 'Manual Only' }
  ];

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!loading && !canManageContent()) {
      navigate("/");
      return;
    }
  }, [user, loading, canManageContent]);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('news_sources')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSources((data || []).map(source => ({
        ...source,
        source_type: source.source_type as 'rss' | 'api'
      })));
    } catch (error) {
      console.error('Error fetching news sources:', error);
      toast({
        title: "Error",
        description: "Failed to fetch news sources",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      source_type: 'rss',
      category: 'general',
      is_active: true,
      fetch_frequency: 24
    });
    setEditingSource(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingSource) {
        const { error } = await supabase
          .from('news_sources')
          .update(formData)
          .eq('id', editingSource.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "News source updated successfully",
        });
      } else {
        const { error } = await supabase
          .from('news_sources')
          .insert([formData]);

        if (error) throw error;

        toast({
          title: "Success",
          description: "News source created successfully",
        });
      }

      setDialogOpen(false);
      resetForm();
      fetchSources();
    } catch (error) {
      console.error('Error saving news source:', error);
      toast({
        title: "Error",
        description: editingSource ? "Failed to update news source" : "Failed to create news source",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (source: NewsSource) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      url: source.url,
      source_type: source.source_type,
      category: source.category,
      is_active: source.is_active,
      fetch_frequency: source.fetch_frequency
    });
    setDialogOpen(true);
  };

  const handleDelete = async (sourceId: string) => {
    try {
      const { error } = await supabase
        .from('news_sources')
        .delete()
        .eq('id', sourceId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "News source deleted successfully",
      });
      
      fetchSources();
    } catch (error) {
      console.error('Error deleting news source:', error);
      toast({
        title: "Error",
        description: "Failed to delete news source",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (sourceId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('news_sources')
        .update({ is_active: !isActive })
        .eq('id', sourceId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `News source ${!isActive ? 'activated' : 'deactivated'}`,
      });
      
      fetchSources();
    } catch (error) {
      console.error('Error updating news source:', error);
      toast({
        title: "Error",
        description: "Failed to update news source",
        variant: "destructive",
      });
    }
  };

  // Manual fetch removed - news is now automatically imported via cron job

  const triggerIndividualFetch = async (sourceId: string, sourceName: string) => {
    try {
      const { error } = await supabase.functions.invoke('fetch-news', {
        body: { sourceId }
      });
      
      if (error) throw error;

      toast({
        title: "Success",
        description: `News fetch triggered for ${sourceName}`,
      });
    } catch (error) {
      console.error('Error triggering individual news fetch:', error);
      toast({
        title: "Error",
        description: `Failed to fetch news for ${sourceName}`,
        variant: "destructive",
      });
    }
  };

  const handleKeywordsEdit = (source: NewsSource) => {
    setEditingSource(source);
    setEditingKeywords(source.keywords || []);
    setKeywordsDialogOpen(true);
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !editingKeywords.includes(newKeyword.trim())) {
      setEditingKeywords([...editingKeywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setEditingKeywords(editingKeywords.filter(k => k !== keyword));
  };

  const saveKeywords = async () => {
    if (!editingSource) return;
    
    try {
      const { error } = await supabase
        .from('news_sources')
        .update({ keywords: editingKeywords })
        .eq('id', editingSource.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Keywords updated successfully",
      });
      
      setKeywordsDialogOpen(false);
      setEditingSource(null);
      setEditingKeywords([]);
      fetchSources();
    } catch (error) {
      console.error('Error updating keywords:', error);
      toast({
        title: "Error",
        description: "Failed to update keywords",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div sx={{ maxWidth: 'lg', mx: 'auto', p: 3 }}>
        <div sx={{ textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  if (!canManageContent()) {
    return (
      <div sx={{ maxWidth: 'lg', mx: 'auto', p: 3 }}>
        <div sx={{ textAlign: 'center' }}>
          <h1 sx={{ fontSize: '1.5rem', fontWeight: 700, mb: 2 }}>Access Denied</h1>
          <p>You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div sx={{ maxWidth: 'lg', mx: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin')}
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <ArrowLeft style={{ height: 16, width: 16 }} />
            Back to Admin
          </Button>
          <div>
            <h1 sx={{ fontSize: '1.875rem', fontWeight: 700 }}>News Sources Management</h1>
            <p style={{ color: 'var(--muted-foreground)' }}>
              Manage RSS feeds and API sources for the news hub
            </p>
          </div>
        </div>
        <div sx={{ display: 'flex', gap: 1 }}>
          <Button
            disabled={true} // Manual trigger disabled - automatic cron job is now active
            variant="outline"
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <RefreshCw style={{ height: 16, width: 16, ...(isLoading ? { animation: 'spin 1s linear infinite' } : {}) }} />
            Fetch News
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
                Add Source
              </Button>
            </DialogTrigger>
            <DialogContent sx={{ maxWidth: { sm: 500 } }}>
              <DialogHeader>
                <DialogTitle>
                  {editingSource ? 'Edit News Source' : 'Add News Source'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div>
                  <Label htmlFor="name">Source Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., LGBTQ+ News Network"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    placeholder="https://example.com/rss"
                    required
                  />
                </div>

                <div sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <div>
                    <Label htmlFor="source_type">Source Type</Label>
                    <Select
                      value={formData.source_type}
                      onValueChange={(value: 'rss' | 'api') => 
                        setFormData({ ...formData, source_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rss">RSS Feed</SelectItem>
                        <SelectItem value="api">API</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category.charAt(0).toUpperCase() + category.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="frequency">Fetch Frequency</Label>
                    <Select
                      value={formData.fetch_frequency.toString()}
                      onValueChange={(value) => setFormData({ ...formData, fetch_frequency: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {frequencies.map((freq) => (
                          <SelectItem key={freq.value} value={freq.value.toString()}>
                            {freq.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                </div>

                <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>

                <div sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2 }}>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingSource ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Total Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{sources.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Active Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>
              {sources.filter(s => s.is_active).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>RSS Feeds</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {sources.filter(s => s.source_type === 'rss').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>API Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {sources.filter(s => s.source_type === 'api').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sources Table */}
      <Card>
        <CardHeader>
          <CardTitle>News Sources</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div sx={{ textAlign: 'center', py: 4 }}>Loading sources...</div>
          ) : sources.length === 0 ? (
            <div sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              No news sources configured yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Articles</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead>Last Fetched</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell sx={{ fontWeight: 500 }}>{source.name}</TableCell>
                    <TableCell>
                      <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {source.source_type === 'rss' ? (
                          <Rss style={{ height: 16, width: 16 }} />
                        ) : (
                          <Globe style={{ height: 16, width: 16 }} />
                        )}
                        {source.source_type.toUpperCase()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {source.status === 'error' ? (
                          <AlertCircle style={{ height: 16, width: 16, color: '#ef4444' }} />
                        ) : (
                          <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
                        )}
                        <div>
                          <Badge variant={source.status === 'error' ? 'destructive' : 'default'}>
                            {source.is_active ? (source.status || 'Active') : 'Inactive'}
                          </Badge>
                          {source.last_error && (
                            <div sx={{ fontSize: '0.75rem', color: '#ef4444', mt: 0.5 }} title={source.last_error}>
                              {source.last_error.length > 30 ? source.last_error.substring(0, 30) + '...' : source.last_error}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div sx={{ fontSize: '0.875rem' }}>
                        <div sx={{ fontWeight: 500 }}>{source.articles_fetched || 0}</div>
                        <div style={{ color: 'var(--muted-foreground)' }}>articles</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {source.source_type === 'api' && (
                        <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <div sx={{ fontSize: '0.75rem' }}>
                            {source.keywords ? source.keywords.slice(0, 2).join(', ') + (source.keywords.length > 2 ? '...' : '') : 'None'}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleKeywordsEdit(source)}
                            sx={{ height: 24, width: 24, p: 0 }}
                          >
                            <Tags style={{ height: 12, width: 12 }} />
                          </Button>
                        </div>
                      )}
                      {source.source_type === 'rss' && (
                        <span sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div sx={{ fontSize: '0.75rem' }}>
                        {source.last_fetched_at ? 
                          new Date(source.last_fetched_at).toLocaleString() : 
                          'Never'
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(source)}
                        >
                          <Edit style={{ height: 16, width: 16 }} />
                        </Button>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => triggerIndividualFetch(source.id, source.name)}
                           title={`Fetch news from ${source.name}`}
                         >
                           <RefreshCw style={{ height: 16, width: 16 }} />
                         </Button>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => window.open(source.url, '_blank')}
                         >
                           <ExternalLink style={{ height: 16, width: 16 }} />
                         </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 style={{ height: 16, width: 16 }} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete News Source</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{source.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(source.id)}
                                sx={{ bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' } }}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Keywords Management Dialog */}
      <Dialog open={keywordsDialogOpen} onOpenChange={setKeywordsDialogOpen}>
        <DialogContent sx={{ maxWidth: { sm: 500 } }}>
          <DialogHeader>
            <DialogTitle>Manage Keywords - {editingSource?.name}</DialogTitle>
          </DialogHeader>
          <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>
              <Label>Current Keywords</Label>
              <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                {editingKeywords.map((keyword, index) => (
                  <Badge key={index} variant="secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {keyword}
                    <Button
                      variant="ghost"
                      size="sm"
                      sx={{ height: 16, width: 16, p: 0, '&:hover': { bgcolor: '#fee2e2' } }}
                      onClick={() => removeKeyword(keyword)}
                    >
                      ×
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
            
            <div>
              <Label htmlFor="newKeyword">Add New Keyword</Label>
              <div sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Input
                  id="newKeyword"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Enter keyword..."
                  onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                />
                <Button onClick={addKeyword} disabled={!newKeyword.trim()}>
                  Add
                </Button>
              </div>
            </div>
            
            <div sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2 }}>
              <Button type="button" variant="outline" onClick={() => setKeywordsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveKeywords}>
                Save Keywords
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}