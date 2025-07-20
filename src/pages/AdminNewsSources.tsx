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

  const triggerNewsFetch = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.functions.invoke('fetch-news');
      
      if (error) throw error;

      toast({
        title: "Success",
        description: "News fetch triggered successfully",
      });
    } catch (error) {
      console.error('Error triggering news fetch:', error);
      toast({
        title: "Error",
        description: "Failed to trigger news fetch",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!canManageContent()) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p>You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Admin
          </Button>
          <div>
            <h1 className="text-3xl font-bold">News Sources Management</h1>
            <p className="text-muted-foreground">
              Manage RSS feeds and API sources for the news hub
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={triggerNewsFetch}
            variant="outline"
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Fetch News
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                Add Source
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingSource ? 'Edit News Source' : 'Add News Source'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
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

                <div className="grid grid-cols-2 gap-4">
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

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>

                <div className="flex justify-end gap-2 pt-4">
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sources.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {sources.filter(s => s.is_active).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">RSS Feeds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sources.filter(s => s.source_type === 'rss').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">API Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
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
            <div className="text-center py-8">Loading sources...</div>
          ) : sources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
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
                    <TableCell className="font-medium">{source.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {source.source_type === 'rss' ? (
                          <Rss className="h-4 w-4" />
                        ) : (
                          <Globe className="h-4 w-4" />
                        )}
                        {source.source_type.toUpperCase()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {source.status === 'error' ? (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        <div>
                          <Badge variant={source.status === 'error' ? 'destructive' : 'default'}>
                            {source.is_active ? (source.status || 'Active') : 'Inactive'}
                          </Badge>
                          {source.last_error && (
                            <div className="text-xs text-red-500 mt-1" title={source.last_error}>
                              {source.last_error.length > 30 ? source.last_error.substring(0, 30) + '...' : source.last_error}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{source.articles_fetched || 0}</div>
                        <div className="text-muted-foreground">articles</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {source.source_type === 'api' && (
                        <div className="flex items-center gap-2">
                          <div className="text-xs">
                            {source.keywords ? source.keywords.slice(0, 2).join(', ') + (source.keywords.length > 2 ? '...' : '') : 'None'}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleKeywordsEdit(source)}
                            className="h-6 w-6 p-0"
                          >
                            <Tags className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      {source.source_type === 'rss' && (
                        <span className="text-muted-foreground text-xs">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        {source.last_fetched_at ? 
                          new Date(source.last_fetched_at).toLocaleString() : 
                          'Never'
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(source)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => triggerIndividualFetch(source.id, source.name)}
                           title={`Fetch news from ${source.name}`}
                         >
                           <RefreshCw className="h-4 w-4" />
                         </Button>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => window.open(source.url, '_blank')}
                         >
                           <ExternalLink className="h-4 w-4" />
                         </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4" />
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
                                className="bg-red-600 hover:bg-red-700"
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Manage Keywords - {editingSource?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Keywords</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {editingKeywords.map((keyword, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1">
                    {keyword}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 hover:bg-red-100"
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
              <div className="flex gap-2 mt-2">
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
            
            <div className="flex justify-end gap-2 pt-4">
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